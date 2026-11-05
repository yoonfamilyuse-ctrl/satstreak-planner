import { ecfToLookAngles, eciToEcf, gstime, propagate, sunPos, type SatRec } from 'satellite.js';
import type { Site } from '../config';
import { sunAltitude } from '../astro/sun';
import type { Regime, SatEntry } from './elements';
import { inFov, makeFov, type Camera, type Fov } from './fov';

/**
 * Satellite visibility predictions.
 *
 * Propagation: SGP4 (satellite.js `propagate`; Vallado et al. 2006, AIAA 2006-6753) gives the position in
 * the TEME frame. TEME → Earth-fixed uses Greenwich mean sidereal time (`gstime`, IAU 1982 GMST, Vallado
 * 2013 eq. 3-47), ignoring polar motion. Topocentric azimuth/elevation: `ecfToLookAngles` with a WGS-84
 * geodetic observer (geometric, no refraction).
 *
 * Sun direction: satellite.js `sunPos` (Vallado 2013, Algorithm 29, low-precision, ~0.01°, mean-of-date
 * equator; the difference from TEME, < 20″, is negligible here).
 *
 * Earth shadow: cylindrical model (Vallado 2013, Algorithm 34 "SHADOW", cylindrical case; Montenbruck &
 * Gill 2000, "Satellite Orbits" §3.4.2). The satellite is in shadow if it is on the night side
 * (r·ŝ < 0) and its distance from the Earth–Sun axis is less than the Earth's equatorial radius.
 * Penumbra and atmospheric refraction are ignored (shadow-entry timing error of a few seconds for LEO).
 *
 * Solar band of an event: Sun's geometric altitude at the event midpoint (astronomy-engine, same as Stage 1).
 */

export const R_EARTH_KM = 6378.137; // WGS-84 equatorial radius
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export type BandKey = 'twilight' | 'dark' | 'gap' | 'outside';

/** twilight: −12°…−20°, dark: −25°…−35°, gap: between them, outside: the 5-min margins. */
export function bandOf(sunAlt: number): BandKey {
  if (sunAlt <= -12 && sunAlt >= -20) return 'twilight';
  if (sunAlt <= -25 && sunAlt >= -35) return 'dark';
  if (sunAlt < -20 && sunAlt > -25) return 'gap';
  return 'outside';
}

const julian = (ms: number) => ms / 86_400_000 + 2440587.5;

interface StepCtx {
  date: Date;
  gmst: number;
  /** Unit vector to the Sun, ECI. */
  sun: [number, number, number];
}

function stepCtx(ms: number): StepCtx {
  const date = new Date(ms);
  const r = sunPos(julian(ms) as any).rsun;
  const n = Math.hypot(r.x, r.y, r.z);
  return { date, gmst: gstime(date), sun: [r.x / n, r.y / n, r.z / n] };
}

/** Cylindrical Earth-shadow test. r in km (ECI), s = unit vector to the Sun. */
export function isSunlit(r: { x: number; y: number; z: number }, s: [number, number, number]): boolean {
  const d = r.x * s[0] + r.y * s[1] + r.z * s[2];
  if (d >= 0) return true;
  const px = r.x - d * s[0];
  const py = r.y - d * s[1];
  const pz = r.z - d * s[2];
  return px * px + py * py + pz * pz >= R_EARTH_KM * R_EARTH_KM;
}

export interface Look {
  /** radians */
  az: number;
  alt: number;
  sunlit: boolean;
}

export function observerGd(site: Site) {
  return { latitude: site.latitude * D2R, longitude: site.longitude * D2R, height: site.elevation / 1000 };
}

function lookAt(satrec: SatRec, ctx: StepCtx, gd: ReturnType<typeof observerGd>, needSunlit = true): Look | null {
  const pv = propagate(satrec, ctx.date);
  if (!pv || !pv.position || satrec.error) return null;
  const p = pv.position as { x: number; y: number; z: number };
  if (!Number.isFinite(p.x)) return null;
  const la = ecfToLookAngles(gd, eciToEcf(p as any, ctx.gmst));
  return { az: la.azimuth, alt: la.elevation, sunlit: needSunlit && la.elevation > 0 ? isSunlit(p, ctx.sun) : false };
}

/** Bisection on a boolean condition between t0 (cond = c0) and t1 (cond = !c0), to `tolMs`. */
function bisect(t0: number, t1: number, cond: (t: number) => boolean, tolMs = 100): number {
  const c0 = cond(t0);
  let a = t0;
  let b = t1;
  while (b - a > tolMs) {
    const m = (a + b) / 2;
    if (cond(m) === c0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

// ---------------------------------------------------------------------------
// Camera-crossing prediction for one shooting window
// ---------------------------------------------------------------------------

export interface Crossing {
  norad: number;
  regime: Regime;
  name: string;
  epoch: number;
  /** FOV entry / exit (ms UTC), refined to 0.1 s; `clipped` if it was already inside at window start/end. */
  entry: number;
  exit: number;
  entryClipped: boolean;
  exitClipped: boolean;
  /** Highest altitude while inside the frame, degrees (10-s samples). */
  maxAlt: number;
  entryAz: number;
  entryAlt: number;
  exitAz: number;
  exitAlt: number;
  band: BandKey;
}

export interface Track {
  norad: number;
  regime: Regime;
  band: BandKey;
  /** Sunlit, above-horizon samples [azDeg, altDeg], split into contiguous segments. */
  segments: [number, number][][];
}

export interface PointingCount {
  azimuth: number;
  altitude: number;
  /** LEO objects only. */
  counts: Record<BandKey, number>;
  /** All orbit regimes. */
  countsAll: Record<BandKey, number>;
}

export interface PredictInput {
  start: number;
  end: number;
  stepS: number;
  site: Site;
  camera: Camera;
  /** Extra cameras for the pointing comparison (10-s resolution, no refinement). */
  pointing: Camera[];
}

export interface PredictResult {
  objects: number;
  propagationFailed: number;
  crossings: Crossing[];
  tracks: Track[];
  pointing: PointingCount[];
  steps: number;
  elapsedMs: number;
}

const emptyCounts = (): Record<BandKey, number> => ({ twilight: 0, dark: 0, gap: 0, outside: 0 });

export function predictCrossings(sats: SatEntry[], inp: PredictInput, onProgress?: (f: number) => void): PredictResult {
  const t0 = performance.now();
  const stepMs = inp.stepS * 1000;
  const times: number[] = [];
  for (let t = inp.start; t < inp.end; t += stepMs) times.push(t);
  times.push(inp.end);
  const K = times.length;
  const ctxs = times.map(stepCtx);
  const sunAlts = times.map((t) => sunAltitude(new Date(t), inp.site));
  const gd = observerGd(inp.site);
  const fovs: Fov[] = [inp.camera, ...inp.pointing].map(makeFov);
  const F = fovs.length;
  const pointing: PointingCount[] = inp.pointing.map((c) => ({ azimuth: c.azimuth, altitude: c.altitude, counts: emptyCounts(), countsAll: emptyCounts() }));
  const crossings: Crossing[] = [];
  const tracks: Track[] = [];
  let propagationFailed = 0;

  const runStart = new Int32Array(F);
  const runMax = new Float64Array(F);

  for (let i = 0; i < sats.length; i++) {
    if (onProgress && i % 400 === 0) onProgress(i / sats.length);
    const sat = sats[i];
    runStart.fill(-1);
    const mainRuns: [number, number, number][] = [];
    const otherRuns: [number, number][] = []; // [fovIndex, midK]
    const track: [number, number, number][] = []; // [k, azDeg, altDeg]
    let failed = false;

    for (let k = 0; k <= K; k++) {
      let vis = false;
      let lk: Look | null = null;
      if (k < K) {
        lk = lookAt(sat.satrec, ctxs[k], gd);
        if (!lk) {
          failed = true;
          break;
        }
        vis = lk.alt > 0 && lk.sunlit;
        if (vis) track.push([k, lk.az * R2D, lk.alt * R2D]);
      }
      for (let f = 0; f < F; f++) {
        const inside = vis && inFov(fovs[f], lk!.az, lk!.alt);
        if (inside) {
          if (runStart[f] < 0) {
            runStart[f] = k;
            runMax[f] = lk!.alt;
          } else if (lk!.alt > runMax[f]) runMax[f] = lk!.alt;
        } else if (runStart[f] >= 0) {
          if (f === 0) mainRuns.push([runStart[f], k - 1, runMax[f]]);
          else otherRuns.push([f, Math.round((runStart[f] + k - 1) / 2)]);
          runStart[f] = -1;
        }
      }
    }
    if (failed) {
      propagationFailed++;
      continue;
    }
    for (const [f, midK] of otherRuns) {
      const b = bandOf(sunAlts[midK]);
      pointing[f - 1].countsAll[b]++;
      if (sat.regime === 'LEO') pointing[f - 1].counts[b]++;
    }
    if (!mainRuns.length) continue;

    // Refine entry/exit of main-camera crossings by bisection on the full condition.
    const cond = (t: number) => {
      const lk = lookAt(sat.satrec, stepCtx(t), gd);
      return !!lk && lk.alt > 0 && lk.sunlit && inFov(fovs[0], lk.az, lk.alt);
    };
    const pos = (t: number) => {
      const lk = lookAt(sat.satrec, stepCtx(t), gd, false)!;
      return [lk.az * R2D, lk.alt * R2D];
    };
    let firstBand: BandKey | null = null;
    for (const [k0, k1, maxAlt] of mainRuns) {
      const entryClipped = k0 === 0;
      const exitClipped = k1 === K - 1;
      const entry = entryClipped ? times[0] : bisect(times[k0 - 1], times[k0], cond);
      const exit = exitClipped ? times[K - 1] : bisect(times[k1], times[k1 + 1], cond);
      const band = bandOf(sunAltitude(new Date((entry + exit) / 2), inp.site));
      firstBand ??= band;
      const [entryAz, entryAlt] = pos(entry);
      const [exitAz, exitAlt] = pos(exit);
      crossings.push({ norad: sat.norad, regime: sat.regime, name: sat.name, epoch: sat.epoch, entry, exit, entryClipped, exitClipped, maxAlt: maxAlt * R2D, entryAz, entryAlt, exitAz, exitAlt, band });
    }
    const segments: [number, number][][] = [];
    let prevK = -2;
    for (const [k, az, alt] of track) {
      if (k !== prevK + 1) segments.push([]);
      segments[segments.length - 1].push([+az.toFixed(2), +alt.toFixed(2)]);
      prevK = k;
    }
    tracks.push({ norad: sat.norad, regime: sat.regime, band: firstBand!, segments });
  }
  onProgress?.(1);
  crossings.sort((a, b) => a.entry - b.entry);
  return { objects: sats.length, propagationFailed, crossings, tracks, pointing, steps: K, elapsedMs: performance.now() - t0 };
}

// ---------------------------------------------------------------------------
// Pass prediction (ISS)
// ---------------------------------------------------------------------------

export interface PassPoint {
  t: number;
  alt: number; // deg
  az: number; // deg
}

export interface Pass {
  /** Geometric horizon (0°) crossings and culmination. */
  rise: PassPoint;
  culmination: PassPoint;
  set: PassPoint;
  /**
   * Visible part: satellite altitude ≥ minAlt (10°), sunlit (cylindrical shadow) and Sun ≤ sunMax (−6°).
   * Same definition of "Start / Highest point / End" as Heavens-Above's visible-pass tables.
   */
  visible: { start: PassPoint; max: PassPoint; end: PassPoint } | null;
}

export interface PassOptions {
  start: number;
  end: number;
  site: Site;
  stepS?: number;
  minAlt?: number;
  sunMax?: number;
}

export function findPasses(sat: SatEntry, o: PassOptions): Pass[] {
  const stepMs = (o.stepS ?? 10) * 1000;
  const minAlt = (o.minAlt ?? 10) * D2R;
  const sunMax = o.sunMax ?? -6;
  const gd = observerGd(o.site);
  const look = (t: number, sunlit = false) => lookAt(sat.satrec, stepCtx(t), gd, sunlit);
  const point = (t: number): PassPoint => {
    const l = look(t)!;
    return { t, alt: l.alt * R2D, az: ((l.az * R2D) % 360 + 360) % 360 };
  };
  const above = (t: number) => (look(t)?.alt ?? -1) > 0;
  const visibleAt = (t: number) => {
    const l = look(t, true);
    return !!l && l.alt >= minAlt && l.sunlit && sunAltitude(new Date(t), o.site) <= sunMax;
  };

  const passes: Pass[] = [];
  let runStart = -1;
  let prevAbove = above(o.start);
  if (prevAbove) runStart = o.start; // already up at start: skip that partial pass below
  for (let t = o.start + stepMs; t <= o.end; t += stepMs) {
    const a = above(t);
    if (a && !prevAbove) runStart = t;
    if (!a && prevAbove && runStart > o.start) {
      const rise = bisect(runStart - stepMs, runStart, above);
      const set = bisect(t - stepMs, t, above);
      passes.push(analysePass(rise, set));
    }
    prevAbove = a;
  }
  return passes;

  function analysePass(rise: number, set: number): Pass {
    // Culmination: golden-section search on altitude.
    let a = rise;
    let b = set;
    const g = (Math.sqrt(5) - 1) / 2;
    const alt = (t: number) => look(t)!.alt;
    let c = b - g * (b - a);
    let d = a + g * (b - a);
    while (b - a > 100) {
      if (alt(c) > alt(d)) b = d;
      else a = c;
      c = b - g * (b - a);
      d = a + g * (b - a);
    }
    const culmT = (a + b) / 2;
    // Visible segment: sample every step, then refine the boundaries.
    let vStart = -1;
    let vEnd = -1;
    for (let t = rise; t <= set; t += stepMs) {
      if (visibleAt(t)) {
        if (vStart < 0) vStart = t;
        vEnd = t;
      }
    }
    let visible: Pass['visible'] = null;
    if (vStart >= 0) {
      const s = vStart - stepMs >= rise ? bisect(vStart - stepMs, vStart, visibleAt) : vStart;
      const e = vEnd + stepMs <= set ? bisect(vEnd, vEnd + stepMs, visibleAt) : vEnd;
      const maxT = culmT >= s && culmT <= e ? culmT : alt(s) > alt(e) ? s : e;
      visible = { start: point(s), max: point(maxT), end: point(e) };
    }
    return { rise: point(rise), culmination: point(culmT), set: point(set), visible };
  }
}
