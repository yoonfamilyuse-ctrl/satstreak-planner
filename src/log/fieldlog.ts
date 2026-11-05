/**
 * Field log: data model and the time bookkeeping needed to sort photos into solar bands.
 *
 * Clock model. The camera clock is off by some offset: camera = true + offset (seconds; positive = camera fast).
 * It is measured by photographing a time.is screen at a fast shutter speed: one reading = (EXIF DateTimeOriginal of
 * that photo) − (time shown on the screen). Several readings are taken before and after the run; each side's offset
 * is their MEAN (with n and min–max spread reported). If EXIF and the screen both show whole seconds, one reading is
 * only good to about ±1 s; averaging 5–10 readings taken at different fractions of a second narrows this.
 * The offset at camera time t is linearly interpolated between the before/after means (constant outside), which
 * also absorbs slow drift. True time = camera time − offset.
 *
 * EXIF facts (CIPA DC-008-2012 / Exif 2.3): DateTimeOriginal = "the date and time when the original image data was
 * generated … the date and time the picture was taken"; whole seconds, "YYYY:MM:DD HH:MM:SS". SubSecTimeOriginal
 * (optional tag) records fractions of a second. The standard does not say whether a long exposure is stamped at its
 * start or end, and we found no Sony documentation for the a7 III on either point — see README for the tests.
 *
 * Frames. With true start time T₀ and interval Δ (the camera's interval setting), frame n starts at
 * T₀ + (n − 1)·Δ. A moment t falls in frame ⌊(t − T₀)/Δ⌋ + 1 (exposure 15 s, then a 1-s gap). A frame belongs
 * to a band if the Sun's altitude at its mid-exposure T₀ + (n − 1)·Δ + E/2 is inside the band (src/astro/frames.ts,
 * the same rule as the night plan, the converter and the ISS check). If the actual end
 * time is logged too, the effective interval (end − start)/(shots − 1) is reported, so drift of the camera's
 * intervalometer can be detected. Frame-level band sorting should ideally use each photo's EXIF time through
 * `toTrueTime`; frame numbers are the fallback when per-frame EXIF times are not at hand.
 */

import { bandFrameRange, FRAME_BAND_RULE } from '../astro/frames';

/**
 * v2: clockBefore/clockAfter hold several readings each (v1 had one).
 * v3: start and end each have their own time source (v2 had one for both).
 */
export const LOG_SCHEMA_VERSION = 3;

export interface ClockCheck {
  /** EXIF DateTimeOriginal of the time.is photo, 'YYYY-MM-DDTHH:MM:SS' (camera clock, KST). */
  exif: string;
  /** Time shown on the time.is screen in that photo, 'YYYY-MM-DDTHH:MM:SS' (true KST). */
  actual: string;
}

/**
 * Clock a logged time was read from. 'camera': the camera clock (EXIF), corrected by the measured offset.
 * 'true': true time read by hand (e.g. time.is). 'phone': the phone's clock, filled by the "Now" button.
 * 'true' and 'phone' are used as true time (no camera-clock correction); 'phone' records where it came from.
 */
export type TimeSource = 'camera' | 'true' | 'phone';
export const TIME_SOURCES: readonly TimeSource[] = ['camera', 'true', 'phone'];

export interface FieldLog {
  schema: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Night (evening date, KST) 'YYYY-MM-DD'. */
  date: string;
  observers: string;
  site: { latitude: number | null; longitude: number | null; elevation: number | null; accuracyM: number | null; source: 'gps' | 'manual' | '' };
  camera: {
    azimuth: number | null;
    altitude: number | null;
    focalLength: number | null;
    iso: number | null;
    aperture: number | null;
    exposureS: number | null;
    intervalS: number | null;
    shotsPlanned: number | null;
    shotsTaken: number | null;
  };
  clouds: string;
  weather: string;
  moon: string;
  notes: string;
  /** Actual start/end of shooting, 'YYYY-MM-DDTHH:MM:SS' KST, read from `timeSource`. */
  start: string;
  end: string;
  /** Which clock each of start/end was read from (e.g. EXIF of the first/last frame = camera). */
  timeSource: { start: TimeSource; end: TimeSource };
  /** time.is readings before / after shooting (several each). */
  clockBefore: ClockCheck[];
  clockAfter: ClockCheck[];
  /** Element set used for this night's predictions (research record). */
  elementSetId: string | null;
}

export function newLog(date: string, now = Date.now()): FieldLog {
  return {
    schema: LOG_SCHEMA_VERSION,
    id: `log-${date}-${now.toString(36)}`,
    createdAt: now,
    updatedAt: now,
    date,
    observers: '',
    site: { latitude: null, longitude: null, elevation: null, accuracyM: null, source: '' },
    camera: { azimuth: null, altitude: null, focalLength: 28, iso: null, aperture: null, exposureS: 15, intervalS: 16, shotsPlanned: null, shotsTaken: null },
    clouds: '',
    weather: '',
    moon: '',
    notes: '',
    start: '',
    end: '',
    timeSource: { start: 'camera', end: 'camera' },
    clockBefore: [{ exif: '', actual: '' }],
    clockAfter: [{ exif: '', actual: '' }],
    elementSetId: null,
  };
}

/** Upgrade a stored log to the current schema (v1 → v2: single clock reading → list; v2 → v3: one time source per time). */
export function migrateLog(raw: any): FieldLog {
  const l = { ...raw };
  const list = (x: unknown): ClockCheck[] => (Array.isArray(x) ? x : x && typeof x === 'object' ? [x as ClockCheck] : [{ exif: '', actual: '' }]);
  l.clockBefore = list(l.clockBefore);
  l.clockAfter = list(l.clockAfter);
  const src = (x: unknown): TimeSource => (TIME_SOURCES.includes(x as TimeSource) ? (x as TimeSource) : 'camera');
  const ts = l.timeSource;
  l.timeSource = ts && typeof ts === 'object' ? { start: src(ts.start), end: src(ts.end) } : { start: src(ts), end: src(ts) };
  l.schema = LOG_SCHEMA_VERSION;
  return l as FieldLog;
}

/** 'YYYY-MM-DDTHH:MM[:SS]' interpreted as KST (UTC+9) → ms since epoch; null if empty/invalid. */
export function parseKst(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number) as unknown as number[];
  const t = Date.UTC(y, mo - 1, d, h - 9, mi, se || 0);
  return Number.isFinite(t) ? t : null;
}

/** ms → 'YYYY-MM-DDTHH:MM:SS' in KST. */
export function formatKst(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 19);
}

/** Camera clock offset in seconds (camera − true), or null if incomplete. */
export function clockOffset(c: ClockCheck): number | null {
  const e = parseKst(c.exif);
  const a = parseKst(c.actual);
  return e === null || a === null ? null : (e - a) / 1000;
}

export interface SideOffset {
  /** Mean offset (s) over complete readings. */
  mean: number;
  n: number;
  min: number;
  max: number;
  /** Mean camera time of the readings (ms), used as the interpolation anchor. */
  at: number;
}

/** Mean offset of several readings (complete ones only), or null if none. */
export function sideOffset(list: ClockCheck[]): SideOffset | null {
  const ok = list
    .map((c) => ({ off: clockOffset(c), t: parseKst(c.exif) }))
    .filter((x): x is { off: number; t: number } => x.off !== null && x.t !== null);
  if (!ok.length) return null;
  const offs = ok.map((x) => x.off);
  return {
    mean: offs.reduce((a, b) => a + b, 0) / ok.length,
    n: ok.length,
    min: Math.min(...offs),
    max: Math.max(...offs),
    at: ok.reduce((a, x) => a + x.t, 0) / ok.length,
  };
}

export interface ClockModel {
  before: number | null;
  after: number | null;
  /** after − before (s), if both. */
  drift: number | null;
  beforeDetail: SideOffset | null;
  afterDetail: SideOffset | null;
}

export function clockModel(log: Pick<FieldLog, 'clockBefore' | 'clockAfter'>): ClockModel {
  const b = sideOffset(log.clockBefore);
  const a = sideOffset(log.clockAfter);
  return { before: b?.mean ?? null, after: a?.mean ?? null, drift: b && a ? a.mean - b.mean : null, beforeDetail: b, afterDetail: a };
}

/** Offset (s) at camera time `camMs`: linear between the before/after means, constant outside; null if none measured. */
export function offsetAt(log: Pick<FieldLog, 'clockBefore' | 'clockAfter'>, camMs: number): number | null {
  const B = sideOffset(log.clockBefore);
  const A = sideOffset(log.clockAfter);
  if (!B && !A) return null;
  if (!B) return A!.mean;
  if (!A) return B.mean;
  const b = B.mean;
  const a = A.mean;
  const tb = B.at;
  const ta = A.at;
  if (ta === tb || camMs <= Math.min(ta, tb)) return ta < tb ? a : b;
  if (camMs >= Math.max(ta, tb)) return ta > tb ? a : b;
  return b + ((a - b) * (camMs - tb)) / (ta - tb);
}

/** Camera-clock time → true time (ms). Without a clock check the camera time is returned unchanged. */
export function toTrueTime(log: Pick<FieldLog, 'clockBefore' | 'clockAfter'>, camMs: number): number {
  const off = offsetAt(log, camMs);
  return off === null ? camMs : camMs - off * 1000;
}

/** True start/end of shooting (ms). Each time gets the clock offset only if it was read from the camera clock. */
export function trueStartEnd(log: Pick<FieldLog, 'start' | 'end' | 'timeSource' | 'clockBefore' | 'clockAfter'>): {
  start: number | null;
  end: number | null;
  /** Start or end was corrected. */
  corrected: boolean;
  startCorrected: boolean;
  endCorrected: boolean;
} {
  const hasOffset = sideOffset(log.clockBefore) !== null || sideOffset(log.clockAfter) !== null;
  const one = (s: string, src: TimeSource) => {
    const t = parseKst(s);
    const cam = src === 'camera';
    return { t: t === null ? null : cam ? toTrueTime(log, t) : t, corrected: t !== null && cam && hasOffset };
  };
  const a = one(log.start, log.timeSource.start);
  const b = one(log.end, log.timeSource.end);
  return { start: a.t, end: b.t, corrected: a.corrected || b.corrected, startCorrected: a.corrected, endCorrected: b.corrected };
}

/** Frame being exposed at true time t (1-based), or null before the start / after the last frame. */
export function frameAtTime(trueStart: number, intervalS: number, t: number, shots?: number | null): number | null {
  if (t < trueStart || !(intervalS > 0)) return null;
  const n = Math.floor((t - trueStart) / (intervalS * 1000)) + 1;
  return shots && n > shots ? null : n;
}

/** True start time of frame n. */
export function frameStart(trueStart: number, intervalS: number, n: number): number {
  return trueStart + (n - 1) * intervalS * 1000;
}

/** Effective interval from logged start/end of the first/last frame and the shot count (s), or null. */
export function effectiveInterval(trueStart: number | null, trueEnd: number | null, shots: number | null): number | null {
  if (trueStart === null || trueEnd === null || !shots || shots < 2) return null;
  return (trueEnd - trueStart) / 1000 / (shots - 1);
}

export interface BandFrames {
  key: 'twilight' | 'dark';
  /** True times of the band edges (Sun at the two altitudes). */
  start: number | null;
  end: number | null;
  /** First/last frame whose mid-exposure lies inside the band (null if none in the run). */
  firstFrame: number | null;
  lastFrame: number | null;
}

/**
 * Frames in each band by the mid-exposure rule (src/astro/frames.ts): the Sun's altitude at frame start +
 * exposure/2 is inside the band. Band times come from the night plan; frames from the actual start and interval.
 */
export function bandFrames(
  trueStart: number,
  intervalS: number,
  exposureS: number,
  shots: number | null,
  bands: { key: 'twilight' | 'dark'; start: Date | null; end: Date | null }[],
): BandFrames[] {
  return bands.map((b) => {
    const s = b.start?.getTime() ?? null;
    const e = b.end?.getTime() ?? null;
    const r = bandFrameRange(trueStart, intervalS, exposureS, shots, s, e);
    return { key: b.key, start: s, end: e, firstFrame: r?.first ?? null, lastFrame: r?.last ?? null };
  });
}

// ---------------------------------------------------------------- export

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One-row CSV of the log plus derived timing fields: a '#' comment line stating the band rule, header, values. */
export function logToCsv(log: FieldLog, derived: Record<string, string | number | null>): string {
  const flat: Record<string, unknown> = {
    id: log.id,
    date: log.date,
    observers: log.observers,
    latitude: log.site.latitude,
    longitude: log.site.longitude,
    elevation_m: log.site.elevation,
    gps_accuracy_m: log.site.accuracyM,
    site_source: log.site.source,
    camera_azimuth_deg: log.camera.azimuth,
    camera_altitude_deg: log.camera.altitude,
    focal_length_mm: log.camera.focalLength,
    iso: log.camera.iso,
    aperture_f: log.camera.aperture,
    exposure_s: log.camera.exposureS,
    interval_s: log.camera.intervalS,
    shots_planned: log.camera.shotsPlanned,
    shots_taken: log.camera.shotsTaken,
    clouds: log.clouds,
    weather: log.weather,
    moon: log.moon,
    notes: log.notes,
    start_logged_kst: log.start,
    end_logged_kst: log.end,
    start_time_source: log.timeSource.start,
    end_time_source: log.timeSource.end,
    clock_before_readings: log.clockBefore.filter((c) => c.exif || c.actual).map((c) => `${c.exif}|${c.actual}`).join(' ; '),
    clock_after_readings: log.clockAfter.filter((c) => c.exif || c.actual).map((c) => `${c.exif}|${c.actual}`).join(' ; '),
    element_set_id: log.elementSetId,
    ...derived,
    updated_at_utc: new Date(log.updatedAt).toISOString(),
  };
  const note = `# Sat-Streak Planner field log. Times KST (UTC+9). Band frames: ${FRAME_BAND_RULE}`;
  return note + '\n' + Object.keys(flat).map(csvCell).join(',') + '\n' + Object.values(flat).map(csvCell).join(',') + '\n';
}
