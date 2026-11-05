import { BANDS, CAMERA, TIMELINE, WINDOW_MARGIN_MIN, type Site } from '../config';
import { addMinutes } from '../time';
import { bandFrameRange } from './frames';
import { moonInfo, type MoonInfo } from './moon';
import { sunEvents, type SunEvents } from './sun';

export interface ShootingWindow {
  start: Date;
  end: Date;
  durationMs: number;
  /** Camera "Number of Shots" at the configured interval: ceil(duration / interval). */
  shots: number;
}

export interface BandSpan {
  key: 'twilight' | 'dark';
  label: string;
  from: number;
  to: number;
  start: Date | null;
  end: Date | null;
  /** Number of frames in the band if shooting starts on plan (mid-exposure rule, see frames.ts). */
  frames: number | null;
  /** First / last frame in the band if shooting starts exactly at the window start (mid-exposure rule). */
  plannedFirst: number | null;
  plannedLast: number | null;
}

export interface TimelineItem {
  time: Date;
  label: string;
  kind: 'task' | 'band';
  /**
   * Task rows: 1-based frame being exposed at `time`. Band rows: the band's first (begins) or last (ends) frame
   * by the mid-exposure rule. Both assume shooting starts exactly at the window start.
   */
  frame: number | null;
}

export interface NightPlan {
  dateStr: string;
  site: Site;
  sun: SunEvents;
  window: ShootingWindow | null;
  bands: BandSpan[];
  timeline: TimelineItem[];
  moon: MoonInfo;
  warnings: string[];
}

export function shotsFor(durationMs: number, intervalS = CAMERA.intervalS): number {
  return Math.ceil(durationMs / 1000 / intervalS);
}

/** Recommended window: 5 min before the Sun reaches −12° to 5 min after it reaches −35°. */
export function shootingWindow(sun: SunEvents): ShootingWindow | null {
  const a = sun.descending[-12];
  const b = sun.descending[-35];
  if (!a || !b) return null;
  const start = addMinutes(a, -WINDOW_MARGIN_MIN);
  const end = addMinutes(b, WINDOW_MARGIN_MIN);
  const durationMs = end.getTime() - start.getTime();
  return { start, end, durationMs, shots: shotsFor(durationMs) };
}

/** 1-based frame number being exposed at time t (frames start every `intervalS` from window start). */
export function frameAt(win: ShootingWindow, t: Date, intervalS = CAMERA.intervalS): number | null {
  const dt = (t.getTime() - win.start.getTime()) / 1000;
  if (dt < 0 || t.getTime() > win.end.getTime()) return null;
  return Math.min(win.shots, Math.floor(dt / intervalS) + 1);
}

/** Band edges and the planned frames in each band (mid-exposure rule, frames.ts) for an on-plan start. */
export function bandSpans(sun: SunEvents, win: ShootingWindow | null = null): BandSpan[] {
  return (['twilight', 'dark'] as const).map((key) => {
    const b = BANDS[key];
    const start = sun.descending[b.from];
    const end = sun.descending[b.to];
    const r = win ? bandFrameRange(win.start.getTime(), CAMERA.intervalS, CAMERA.exposureS, win.shots, start?.getTime() ?? null, end?.getTime() ?? null) : null;
    return { key, label: b.label, from: b.from, to: b.to, start, end, frames: r ? r.last - r.first + 1 : null, plannedFirst: r?.first ?? null, plannedLast: r?.last ?? null };
  });
}

export function fieldTimeline(win: ShootingWindow, bands: BandSpan[]): TimelineItem[] {
  const items: Omit<TimelineItem, 'frame'>[] = [
    { time: addMinutes(win.start, -TIMELINE.arriveBeforeStartMin), label: 'Arrive and set up (tripod, level, power, card)', kind: 'task' },
    { time: addMinutes(win.start, -TIMELINE.focusBeforeStartMin), label: 'Focus (live-view magnify on a bright star)', kind: 'task' },
    { time: addMinutes(win.start, -TIMELINE.timeIsPhotoBeforeStartMin), label: 'Photograph the time.is screen (clock check, before)', kind: 'task' },
    { time: win.start, label: `Start shooting (${CAMERA.exposureS} s / ${CAMERA.intervalS} s interval, ${win.shots} shots)`, kind: 'task' },
    { time: win.end, label: 'End shooting', kind: 'task' },
    { time: addMinutes(win.end, TIMELINE.timeIsPhotoAfterEndMin), label: 'Photograph the time.is screen (clock check, after)', kind: 'task' },
  ];
  const bandItems: TimelineItem[] = [];
  for (const b of bands) {
    if (b.start) bandItems.push({ time: b.start, label: `${b.label} begins (Sun ${b.from}°)`, kind: 'band', frame: b.plannedFirst });
    if (b.end) bandItems.push({ time: b.end, label: `${b.label} ends (Sun ${b.to}°)`, kind: 'band', frame: b.plannedLast });
  }
  return [...items.map((it) => ({ ...it, frame: frameAt(win, it.time) })), ...bandItems].sort((x, y) => x.time.getTime() - y.time.getTime());
}

export function computeNight(dateStr: string, site: Site): NightPlan {
  const sun = sunEvents(dateStr, site);
  const window = shootingWindow(sun);
  const bands = bandSpans(sun, window);
  const warnings: string[] = [];
  for (const alt of [-12, -20, -25, -35] as const) {
    if (!sun.descending[alt]) warnings.push(`The Sun does not reach ${alt}° on this night at this site, so the ${alt <= -25 ? 'dark' : 'twilight'} band cannot be observed.`);
  }
  const timeline = window ? fieldTimeline(window, bands) : [];
  const moon = moonInfo(dateStr, site, window);
  return { dateStr, site, sun, window, bands, timeline, moon, warnings };
}
