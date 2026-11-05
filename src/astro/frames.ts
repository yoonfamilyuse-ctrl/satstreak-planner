/**
 * Which frames belong to which solar band. ONE rule, used everywhere (night plan "Planned", field-log "Actual",
 * the photo → band converter, the ISS timing check and every export):
 *
 *   Frame n belongs to a band if the Sun's altitude at its MID-EXPOSURE,
 *       t_mid(n) = T₀ + (n − 1)·Δ + E/2,
 *   lies inside the band (twilight −12°…−20°, dark −25°…−35°, edges included).
 *   T₀ = true start of frame 1, Δ = interval, E = exposure time.
 *
 * So each frame goes to the band in which most of its exposure lies. The shooting window is in the evening,
 * between sunset and the Sun's lowest point (solar midnight), where the Sun's altitude decreases monotonically;
 * "altitude at t_mid inside the band" is then the same as "t(from) ≤ t_mid ≤ t(to)", with the band-edge times
 * t(−12°), t(−20°), t(−25°), t(−35°) from the night plan (astronomy-engine altitude search, see sun.ts). The
 * functions below use those times, so every part of the app gives the same answer at a band edge.
 */

export type FrameBand = 'twilight' | 'dark' | 'gap' | 'outside';

export interface BandEdges {
  key: 'twilight' | 'dark';
  start: Date | null;
  end: Date | null;
}

/** Mid-exposure time (ms) of frame n (1-based). */
export function midExposure(trueStart: number, intervalS: number, exposureS: number, n: number): number {
  return trueStart + (n - 1) * intervalS * 1000 + exposureS * 500;
}

/**
 * First and last frame whose mid-exposure lies in [bandStart, bandEnd] (ms), limited to frames 1…shots;
 * null if no frame does (or a band edge is missing).
 */
export function bandFrameRange(
  trueStart: number,
  intervalS: number,
  exposureS: number,
  shots: number | null,
  bandStart: number | null,
  bandEnd: number | null,
): { first: number; last: number } | null {
  if (bandStart === null || bandEnd === null || !(intervalS > 0)) return null;
  const dt = intervalS * 1000;
  const off = trueStart + exposureS * 500; // mid-exposure of frame 1
  const first = Math.max(1, Math.ceil((bandStart - off) / dt) + 1);
  const last = Math.min(shots ?? Infinity, Math.floor((bandEnd - off) / dt) + 1);
  return first <= last ? { first, last } : null;
}

/** Band of a moment (e.g. a frame's mid-exposure), from the plan's band-edge times; same edges as bandFrameRange. */
export function bandAtTime(t: number, bands: BandEdges[]): FrameBand {
  const tw = bands.find((b) => b.key === 'twilight');
  const dk = bands.find((b) => b.key === 'dark');
  const s = (b?: BandEdges) => b?.start?.getTime() ?? null;
  const e = (b?: BandEdges) => b?.end?.getTime() ?? null;
  const inside = (b?: BandEdges) => s(b) !== null && e(b) !== null && t >= s(b)! && t <= e(b)!;
  if (inside(tw)) return 'twilight';
  if (inside(dk)) return 'dark';
  if (e(tw) !== null && s(dk) !== null && t > e(tw)! && t < s(dk)!) return 'gap';
  return 'outside';
}

/** Text of the rule, for CSV headers, export READMEs and notes. */
export const FRAME_BAND_RULE =
  'A frame belongs to a band if the Sun altitude at frame start + exposure/2 (true time) is inside the band (twilight -12 to -20 deg, dark -25 to -35 deg, edges included).';
