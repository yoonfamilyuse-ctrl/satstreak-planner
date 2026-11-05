import { Body, SearchAltitude } from 'astronomy-engine';
import type { Site } from './config';
import { toObserver } from './astro/observer';
import { addDays, kstNoon, todayKST } from './time';

/**
 * Automatic night mode. When the user has not switched night mode on, the app still shows night mode while the
 * Sun is below AUTO_NIGHT_ALT at the saved site (civil twilight has ended), unless the user chose day mode for
 * that night.
 *
 * The decision must be made before first paint, in the inline script in index.html, which cannot load
 * astronomy-engine. So the app precomputes the dark spans for the coming nights and stores them; the inline
 * script only compares the clock with those stored times. Spans are found with astronomy-engine `SearchAltitude`
 * on the geometric altitude of the Sun's centre (same method as the night plan, see astro/sun.ts):
 * evening descent through −6° → next morning's ascent through −6°.
 *
 * Storage (localStorage):
 *   satstreak.night         '1' = user switched night mode on (sticky, as before); otherwise off.
 *   satstreak.darkSpans     {"site": "<lat>,<lon>,<elev>", "spans": [[startMs, endMs], ...]}
 *   satstreak.nightOverride startMs of the span in which the user chose day mode.
 * KEEP IN SYNC with the inline script in index.html (tests/autonight.test.ts runs that script).
 */

export const AUTO_NIGHT_ALT = -6;
export const NIGHT_KEY = 'satstreak.night';
export const SPANS_KEY = 'satstreak.darkSpans';
export const OVERRIDE_KEY = 'satstreak.nightOverride';
/** Nights precomputed ahead (covers opening the app up to two weeks after the last visit). */
export const SPAN_DAYS = 16;

export type Span = [number, number];
export type ThemeDecision = 'night' | 'auto-night' | 'day';

export const siteKey = (s: Site) => `${s.latitude},${s.longitude},${s.elevation}`;

/** Dark spans (Sun below −6°) for the evenings from `fromDate` (KST) for `days` nights. */
export function darkSpans(site: Site, fromDate: string, days = SPAN_DAYS): Span[] {
  const obs = toObserver(site);
  const spans: Span[] = [];
  for (let i = 0; i < days; i++) {
    const noon = kstNoon(addDays(fromDate, i));
    const down = SearchAltitude(Body.Sun, obs, -1, noon, 1, AUTO_NIGHT_ALT)?.date;
    if (!down) continue;
    const up = SearchAltitude(Body.Sun, obs, +1, down, 1, AUTO_NIGHT_ALT)?.date;
    if (!up) continue;
    spans.push([down.getTime(), up.getTime()]);
  }
  return spans;
}

export function spanAt(t: number, spans: Span[]): Span | null {
  return spans.find(([a, b]) => t >= a && t < b) ?? null;
}

/** Theme for time `t`. Pure; mirrors the inline script in index.html. */
export function decideTheme(t: number, nightPref: string | null, spans: Span[], override: string | null): ThemeDecision {
  if (nightPref === '1') return 'night';
  const s = spanAt(t, spans);
  return s && String(s[0]) !== override ? 'auto-night' : 'day';
}

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: auto night simply works from the in-memory spans */
  }
}

let memSpans: Span[] = [];

/** Recompute and store the dark spans for `site`, starting with yesterday's evening (for after midnight). */
export function refreshSpans(site: Site, today = todayKST()) {
  memSpans = darkSpans(site, addDays(today, -1));
  set(SPANS_KEY, JSON.stringify({ site: siteKey(site), spans: memSpans }));
}

export function storedSpans(): Span[] {
  if (memSpans.length) return memSpans;
  try {
    const v = JSON.parse(get(SPANS_KEY) ?? 'null');
    return Array.isArray(v?.spans) ? v.spans : [];
  } catch {
    return [];
  }
}

export function currentDecision(t = Date.now()): ThemeDecision {
  return decideTheme(t, get(NIGHT_KEY), storedSpans(), get(OVERRIDE_KEY));
}

/**
 * The user switched night mode on or off. Switching it off inside a dark span remembers "day mode for this
 * night", so automatic night mode does not switch it back until the next evening.
 */
export function userSetNight(on: boolean, t = Date.now()) {
  set(NIGHT_KEY, on ? '1' : '0');
  const s = spanAt(t, storedSpans());
  if (!on && s) set(OVERRIDE_KEY, String(s[0]));
  if (on) set(OVERRIDE_KEY, null);
}
