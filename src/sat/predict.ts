import { ecfToEci, ecfToLookAngles, eciToEcf, geodeticToEcf, gstime, propagate, sunPos, type SatRec } from 'satellite.js';
import type { Site } from '../config';
import { sunAltitude } from '../astro/sun';
import type { Regime, SatEntry } from './elements';
import { inFov, makeFov, type Camera, type Fov } from './fov';
import { phaseTerm, visualMagnitude, type PhaseLaw } from './magnitude';

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
/**
 * Crossing objects closer than this (3-D, while both are in the frame) are flagged as a train: their streaks may
 * overlap or run side by side in the photos. Only identical element sets are merged (see colocatedGroups).
 */
export const TRAIN_KM = 2;
/**
 * Crewed stations: ISS (ZARYA, 25544) and Tiangong / CSS (TIANHE, 48274). Visiting vehicles can carry their own
 * (often older) element set, different from the station's, so identical-element merging misses them. Only for
 * these two, an object that stays within STATION_KM of the station for its whole time in frame is part of the
 * station (one streak). No distance-based merging is done for any other object.
 */
export const CREWED_STATIONS: readonly number[] = [25544, 48274];
export const STATION_KM = 2;
/**
 * Upper bound on the rate at which two Earth-orbiting objects' separation can change (km/s): each object's speed
 * on a bound orbit is below the escape speed at its radius, √(2μ/r) ≤ √(2μ/R⊕) = 11.18 km/s with
 * μ = 398 600.4418 km³ s⁻² (WGS-84, NIMA TR8350.2) and R⊕ = 6378.137 km; two objects: 2 × 11.18 km/s.
 */
const V_REL_MAX_KM_S = 2 * Math.sqrt((2 * 398600.4418) / R_EARTH_KM);
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
  /** Observer–satellite range, km. */
  rangeKm: number;
  /** Solar phase angle Sun–satellite–observer, radians (only when sunlit was evaluated). */
  phase: number;
}

export function observerGd(site: Site) {
  return { latitude: site.latitude * D2R, longitude: site.longitude * D2R, height: site.elevation / 1000 };
}

type Gd = ReturnType<typeof observerGd>;
const obsEcfCache = new WeakMap<Gd, { x: number; y: number; z: number }>();

function lookAt(satrec: SatRec, ctx: StepCtx, gd: Gd, needSunlit = true): Look | null {
  const pv = propagate(satrec, ctx.date);
  if (!pv || !pv.position || satrec.error) return null;
  const p = pv.position as { x: number; y: number; z: number };
  if (!Number.isFinite(p.x)) return null;
  const la = ecfToLookAngles(gd, eciToEcf(p as any, ctx.gmst));
  let sunlit = false;
  let phase = NaN;
  if (needSunlit && la.elevation > 0) {
    sunlit = isSunlit(p, ctx.sun);
    if (sunlit) {
      // Observer position in the same inertial frame (TEME ≈ via GMST rotation, as for the satellite).
      let oe = obsEcfCache.get(gd);
      if (!oe) obsEcfCache.set(gd, (oe = geodeticToEcf(gd as any) as any));
      const o = ecfToEci(oe as any, ctx.gmst) as { x: number; y: number; z: number };
      const vx = o.x - p.x;
      const vy = o.y - p.y;
      const vz = o.z - p.z;
      const r = Math.hypot(vx, vy, vz);
      // Sun at infinity: Sun direction from the satellite = Sun direction from Earth's centre.
      const c = (vx * ctx.sun[0] + vy * ctx.sun[1] + vz * ctx.sun[2]) / r;
      phase = Math.acos(Math.max(-1, Math.min(1, c)));
    }
  }
  return { az: la.azimuth, alt: la.elevation, sunlit, rangeKm: la.rangeSat, phase };
}

/** Great-circle angle between two (az, alt) directions given in radians, result in degrees (haversine; accurate for small angles). */
export function haversineDeg(az1: number, alt1: number, az2: number, alt2: number): number {
  const s1 = Math.sin((alt2 - alt1) / 2);
  const s2 = Math.sin((az2 - az1) / 2);
  const h = s1 * s1 + Math.cos(alt1) * Math.cos(alt2) * s2 * s2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * R2D;
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
  /**
   * Geometric part of the magnitude at the brightest in-frame sample (10-s samples):
   * 5·log₁₀(d/1000 km) − 2.5·log₁₀F(φ). Predicted magnitude = m1000 + magRel.
   */
  magRel: number;
  /**
   * Every in-frame 10-s sample as [magRel, ω]: geometric magnitude part and apparent angular speed (deg/s).
   * All detection models are evaluated on these same samples (see detection.ts).
   */
  samples: [number, number][];
  /** Published intrinsic magnitude, or null (unknown). */
  m1000: number | null;
  /** Key of the intrinsic-magnitude source (see magnitude.ts), or null. */
  magKey: string | null;
  /** Starlink version from GCAT, if a Starlink. */
  starlinkVersion?: string;
  /**
   * Other catalogue objects merged into this crossing: 'elements' = identical element set (docked modules and
   * vehicles); 'station' = stayed within STATION_KM of this crewed station for its whole time in frame.
   */
  merged: { norad: number; name: string; how: 'elements' | 'station' }[];
  /**
   * Other crossing objects that come within TRAIN_KM of this one while both are in the frame (e.g. a fresh
   * launch train), with the smallest separation found (km). Empty if none. Each object still has its own crossing.
   */
  train: { norad: number; name: string; minKm: number }[];
}

export interface Track {
  norad: number;
  regime: Regime;
  band: BandKey;
  /** Sunlit, above-horizon samples [azDeg, altDeg], split into contiguous segments. */
  segments: [number, number][][];
}

/** One frame crossing for a candidate pointing (10-s resolution, no refinement). */
export interface PointingRun {
  band: BandKey;
  leo: boolean;
  /** Geometric magnitude part at the brightest in-frame sample (see Crossing.magRel). */
  magRel: number;
  /** In-frame samples [magRel, ω deg/s] (see Crossing.samples). */
  samples: [number, number][];
  m1000: number | null;
  norad: number;
  /** First / last in-frame sample (ms UTC). */
  start: number;
  end: number;
}

export interface PointingCount {
  azimuth: number;
  altitude: number;
  runs: PointingRun[];
}

export interface PredictInput {
  start: number;
  end: number;
  stepS: number;
  site: Site;
  camera: Camera;
  /** Extra cameras for the pointing comparison (10-s resolution, no refinement). */
  pointing: Camera[];
  phaseLaw?: PhaseLaw;
}

export interface PredictResult {
  objects: number;
  propagationFailed: number;
  /** Catalogue objects merged into a representative with the identical element set (ISS modules, docked vehicles). */
  mergedObjects: number;
  /** Catalogue objects merged into a crewed station because they stayed within STATION_KM of it in frame. */
  stationMerged: number;
  crossings: Crossing[];
  tracks: Track[];
  pointing: PointingCount[];
  steps: number;
  elapsedMs: number;
}

export function predictCrossings(sats: SatEntry[], inp: PredictInput, onProgress?: (f: number) => void): PredictResult {
  const t0 = performance.now();
  const stepMs = inp.stepS * 1000;
  const times: number[] = [];
  for (let t = inp.start; t < inp.end; t += stepMs) times.push(t);
  times.push(inp.end);
  const K = times.length;
  const ctxs = times.map(stepCtx);
  // Positions 1 s later give the apparent angular speed for the trailing-loss model.
  const ctxs1 = times.map((t) => stepCtx(t + 1000));
  const sunAlts = times.map((t) => sunAltitude(new Date(t), inp.site));
  const gd = observerGd(inp.site);
  const fovs: Fov[] = [inp.camera, ...inp.pointing].map(makeFov);
  const F = fovs.length;
  const pointing: PointingCount[] = inp.pointing.map((c) => ({ azimuth: c.azimuth, altitude: c.altitude, runs: [] }));
  const crossings: Crossing[] = [];
  const tracks: Track[] = [];
  let propagationFailed = 0;

  // Docked modules and visiting vehicles (the ISS appears as ~10 catalogue entries) share one element set and
  // would otherwise be counted several times. Only identical element sets are merged; a launch train is not.
  const { skip, members } = colocatedGroups(sats);

  const runStart = new Int32Array(F);
  const runMax = new Float64Array(F);
  const runMag = new Float64Array(F);
  const runSamples: [number, number][][] = Array.from({ length: F }, () => []);
  const ins = new Uint8Array(F);

  for (let i = 0; i < sats.length; i++) {
    if (onProgress && i % 400 === 0) onProgress(i / sats.length);
    const sat = sats[i];
    if (skip.has(i)) continue;
    const m1000 = sat.intrinsic?.m1000 ?? null;
    runStart.fill(-1);
    const mainRuns: [number, number, number, number, [number, number][]][] = []; // [k0, k1, maxAlt, minMagRel, samples]
    const track: [number, number, number][] = []; // [k, azDeg, altDeg]
    let failed = false;

    for (let k = 0; k <= K; k++) {
      let vis = false;
      let lk: Look | null = null;
      let rel = Infinity;
      if (k < K) {
        lk = lookAt(sat.satrec, ctxs[k], gd);
        if (!lk) {
          failed = true;
          break;
        }
        vis = lk.alt > 0 && lk.sunlit;
        if (vis) {
          track.push([k, lk.az * R2D, lk.alt * R2D]);
          rel = 5 * Math.log10(lk.rangeKm / 1000) + phaseTerm(lk.phase, inp.phaseLaw);
        }
      }
      let insideAny = false;
      for (let f = 0; f < F; f++) {
        ins[f] = vis && inFov(fovs[f], lk!.az, lk!.alt) ? 1 : 0;
        if (ins[f]) insideAny = true;
      }
      let omega = NaN;
      if (insideAny) {
        const l2 = lookAt(sat.satrec, ctxs1[k], gd, false);
        if (l2) omega = haversineDeg(lk!.az, lk!.alt, l2.az, l2.alt); // deg per 1 s
      }
      const sample: [number, number] = [+rel.toFixed(3), +omega.toFixed(5)];
      for (let f = 0; f < F; f++) {
        if (ins[f]) {
          if (runStart[f] < 0) {
            runStart[f] = k;
            runMax[f] = lk!.alt;
            runMag[f] = rel;
            runSamples[f] = [sample];
          } else {
            if (lk!.alt > runMax[f]) runMax[f] = lk!.alt;
            if (rel < runMag[f]) runMag[f] = rel;
            runSamples[f].push(sample);
          }
        } else if (runStart[f] >= 0) {
          const k0 = runStart[f];
          const k1 = k - 1;
          const relVal = +runMag[f].toFixed(2);
          if (f === 0) mainRuns.push([k0, k1, runMax[f], relVal, runSamples[f]]);
          else
            pointing[f - 1].runs.push({
              band: bandOf(sunAlts[Math.round((k0 + k1) / 2)]),
              leo: sat.regime === 'LEO',
              magRel: relVal,
              samples: runSamples[f],
              m1000,
              norad: sat.norad,
              start: times[k0],
              end: times[k1],
            });
          runStart[f] = -1;
        }
      }
    }
    if (failed) {
      propagationFailed++;
      // Drop partial pointing runs from a satellite that failed mid-window.
      for (const pc of pointing) pc.runs = pc.runs.filter((r) => r.norad !== sat.norad);
      continue;
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
    for (const [k0, k1, maxAlt, magRel, samples] of mainRuns) {
      const entryClipped = k0 === 0;
      const exitClipped = k1 === K - 1;
      const entry = entryClipped ? times[0] : bisect(times[k0 - 1], times[k0], cond);
      const exit = exitClipped ? times[K - 1] : bisect(times[k1], times[k1 + 1], cond);
      const band = bandOf(sunAltitude(new Date((entry + exit) / 2), inp.site));
      firstBand ??= band;
      const [entryAz, entryAlt] = pos(entry);
      const [exitAz, exitAlt] = pos(exit);
      crossings.push({
        norad: sat.norad,
        regime: sat.regime,
        name: sat.name,
        epoch: sat.epoch,
        entry,
        exit,
        entryClipped,
        exitClipped,
        maxAlt: maxAlt * R2D,
        entryAz,
        entryAlt,
        exitAz,
        exitAlt,
        band,
        magRel,
        samples,
        m1000,
        magKey: sat.intrinsic?.key ?? null,
        starlinkVersion: sat.starlinkVersion,
        merged: (members.get(i) ?? []).map((j) => ({ norad: sats[j].norad, name: sats[j].name, how: 'elements' as const })),
        train: [],
      });
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
  const byNorad = new Map(sats.map((s) => [s.norad, s]));
  const st = mergeIntoStations(crossings, pointing, byNorad);
  if (st.dropTracks.size) tracks.splice(0, tracks.length, ...tracks.filter((t) => !st.dropTracks.has(t.norad)));
  flagTrains(crossings, byNorad);
  onProgress?.(1);
  crossings.sort((a, b) => a.entry - b.entry);
  return { objects: sats.length, propagationFailed, mergedObjects: skip.size, stationMerged: st.merged, crossings, tracks, pointing, steps: K, elapsedMs: performance.now() - t0 };
}

/**
 * Groups of objects with the IDENTICAL element set (same epoch and mean elements): this is how docked modules
 * and visiting vehicles appear in the catalogue (CelesTrak publishes the station's elements for each of them),
 * so they are one physical object and one streak. Objects that are merely close (a fresh launch train) have
 * distinct element sets and are not merged; flagTrains marks them instead.
 * Representative: ISS (25544) if present in the group, else an object with a published magnitude, else the
 * lowest catalogue number. Returns indices to skip and each representative's members.
 */
export function colocatedGroups(sats: SatEntry[]) {
  const key = (r: SatRec) => [r.epochyr, r.epochdays, r.inclo, r.nodeo, r.ecco, r.argpo, r.mo, r.no].join('|');
  const groups = new Map<string, number[]>();
  sats.forEach((s, i) => {
    const k = key(s.satrec);
    groups.get(k)?.push(i) ?? groups.set(k, [i]);
  });
  const skip = new Set<number>();
  const members = new Map<number, number[]>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const rank = (i: number) => (CREWED_STATIONS.includes(sats[i].norad) ? 0 : sats[i].intrinsic ? 1 : 2);
    const rep = [...g].sort((a, b) => rank(a) - rank(b) || sats[a].norad - sats[b].norad)[0];
    members.set(rep, g.filter((i) => i !== rep));
    for (const i of g) if (i !== rep) skip.add(i);
  }
  return { skip, members };
}

function eciPos(s: SatEntry, t: number) {
  const p = propagate(s.satrec, new Date(t))?.position as { x: number; y: number; z: number } | undefined;
  return p && Number.isFinite(p.x) ? p : null;
}

/** True if `obj` stays within `km` of `station` (3-D, SGP4) at every second from t0 to t1 (and at both ends). */
export function staysWithin(obj: SatEntry, station: SatEntry, t0: number, t1: number, km: number): boolean {
  const n = Math.max(1, Math.ceil((t1 - t0) / 1000));
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n;
    const p = eciPos(obj, t);
    const q = eciPos(station, t);
    if (!p || !q || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) >= km) return false;
  }
  return true;
}

/**
 * Fold crossings (and pointing-comparison runs) of objects that stay within STATION_KM of a crewed station for
 * their whole time in frame into that station's overlapping crossing (run). If the station itself has no
 * overlapping crossing (an edge case at a frame border), the object's crossing is kept. Mutates its inputs.
 */
export function mergeIntoStations(crossings: Crossing[], pointing: PointingCount[], byNorad: Map<number, SatEntry>) {
  const stations = CREWED_STATIONS.map((n) => byNorad.get(n)).filter((s): s is SatEntry => !!s);
  const merged = new Set<number>();
  const kept = new Set<number>(); // objects with at least one crossing that was not merged
  if (!stations.length) return { merged: 0, dropTracks: merged };
  const near = (norad: number, t0: number, t1: number) => {
    const o = byNorad.get(norad);
    return o ? stations.find((s) => s.norad !== norad && staysWithin(o, s, t0, t1, STATION_KM)) ?? null : null;
  };
  for (let i = crossings.length - 1; i >= 0; i--) {
    const c = crossings[i];
    if (CREWED_STATIONS.includes(c.norad)) continue;
    const s = near(c.norad, c.entry, c.exit);
    const host = s && crossings.find((x) => x.norad === s.norad && x.entry <= c.exit && x.exit >= c.entry);
    if (!host) {
      kept.add(c.norad);
      continue;
    }
    host.merged.push({ norad: c.norad, name: c.name, how: 'station' }, ...c.merged.map((m) => ({ ...m, how: 'station' as const })));
    merged.add(c.norad);
    for (const m of c.merged) merged.add(m.norad);
    crossings.splice(i, 1);
  }
  for (const pc of pointing) {
    pc.runs = pc.runs.filter((r) => {
      if (CREWED_STATIONS.includes(r.norad)) return true;
      const s = near(r.norad, r.start, r.end);
      return !(s && pc.runs.some((x) => x.norad === s.norad && x.start <= r.end && x.end >= r.start));
    });
  }
  const dropTracks = new Set([...merged].filter((n) => !kept.has(n)));
  return { merged: merged.size, dropTracks };
}

/**
 * Mark crossings whose objects come within TRAIN_KM of each other while both are in the frame. For each pair of
 * crossings with overlapping in-frame intervals, the 3-D separation (SGP4, TEME) is sampled every second over the
 * overlap (at least at its start, middle and end) and the minimum is kept.
 */
export function flagTrains(crossings: Crossing[], byNorad: Map<number, SatEntry>): { evaluations: number } {
  const order = crossings.map((_, i) => i).sort((a, b) => crossings[a].entry - crossings[b].entry);
  let evaluations = 0;
  for (let a = 0; a < order.length; a++) {
    const ca = crossings[order[a]];
    const sa = byNorad.get(ca.norad);
    if (!sa) continue;
    for (let b = a + 1; b < order.length; b++) {
      const cb = crossings[order[b]];
      if (cb.entry > ca.exit) break; // sorted by entry: no later crossing overlaps ca
      const sb = byNorad.get(cb.norad);
      if (!sb || cb.norad === ca.norad) continue;
      const t0 = Math.max(ca.entry, cb.entry);
      const t1 = Math.min(ca.exit, cb.exit);
      // Separation can shrink no faster than V_REL_MAX, so after a separation d the next (d − TRAIN_KM)/V_REL_MAX
      // seconds cannot bring the pair within TRAIN_KM and are skipped. Close pairs are sampled every second.
      let min = Infinity;
      for (let t = t0; ; ) {
        const p = eciPos(sa, t);
        const q = eciPos(sb, t);
        evaluations++;
        const d = p && q ? Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) : Infinity;
        if (d < min) min = d;
        if (t >= t1) break;
        const skipS = Number.isFinite(d) ? Math.max(1, (d - TRAIN_KM) / V_REL_MAX_KM_S) : 1;
        t = Math.min(t1, t + skipS * 1000);
      }
      if (min < TRAIN_KM) {
        const km = +min.toFixed(3);
        ca.train.push({ norad: cb.norad, name: cb.name, minKm: km });
        cb.train.push({ norad: ca.norad, name: ca.name, minKm: km });
      }
    }
  }
  return { evaluations };
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
  /** Brightest predicted magnitude during the visible part (5-s samples), if the object has an intrinsic magnitude. */
  brightest: { t: number; mag: number; phaseDeg: number; rangeKm: number } | null;
}

export interface PassOptions {
  start: number;
  end: number;
  site: Site;
  stepS?: number;
  minAlt?: number;
  sunMax?: number;
  phaseLaw?: PhaseLaw;
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
    let brightest: Pass['brightest'] = null;
    const m1000 = sat.intrinsic?.m1000;
    if (visible && m1000 !== undefined) {
      for (let t = visible.start.t; t <= visible.end.t; t += 5000) {
        const l = look(t, true);
        if (!l || !l.sunlit) continue;
        const mag = visualMagnitude(m1000, l.rangeKm, l.phase, o.phaseLaw);
        if (!brightest || mag < brightest.mag) brightest = { t, mag, phaseDeg: l.phase * R2D, rangeKm: l.rangeKm };
      }
    }
    return { rise: point(rise), culmination: point(culmT), set: point(set), visible, brightest };
  }
}

/** Topocentric position (deg) and sunlit flag of one object at given times, for timing checks. */
export function trackPositions(sat: SatEntry, times: number[], site: Site): { t: number; az: number; alt: number; sunlit: boolean }[] {
  const gd = observerGd(site);
  return times.map((t) => {
    const l = lookAt(sat.satrec, stepCtx(t), gd, true);
    return l ? { t, az: ((l.az * R2D) % 360 + 360) % 360, alt: l.alt * R2D, sunlit: l.sunlit } : { t, az: NaN, alt: NaN, sunlit: false };
  });
}
