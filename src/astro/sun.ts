import { Body, Equator, Horizon, SearchAltitude, SearchRiseSet } from 'astronomy-engine';
import type { Site } from '../config';
import { kstNoon } from '../time';
import { toObserver } from './observer';

/**
 * Solar altitudes (degrees) whose crossing times we list on the evening of a date.
 *  −6 / −12 / −18: civil / nautical / astronomical twilight (directly comparable with KASI and timeanddate.com).
 *  −12 → −20: twilight band.  −25 → −35: dark band.
 */
export const SUN_ALTITUDES = [-6, -12, -18, -20, -25, -35] as const;
export type SunAltitude = (typeof SUN_ALTITUDES)[number];

export interface SunEvents {
  /** Sunset: upper limb at the horizon, refraction included (astronomy-engine SearchRiseSet). */
  sunset: Date | null;
  /**
   * Time the Sun's centre descends through each altitude.
   * Geometric (airless) topocentric altitude, i.e. NO refraction, which is the standard
   * definition used for twilight (e.g. U.S. Naval Observatory, KASI).
   * null if the Sun does not reach that altitude that night.
   */
  descending: Record<SunAltitude, Date | null>;
}

/**
 * Evening Sun events for the KST date `dateStr`, searching from local noon for up to one day.
 * Method: astronomy-engine `SearchAltitude` (root finding on the topocentric apparent altitude
 * computed from `Equator(..., ofdate=true, aberration=true)` + `Horizon(...)` without refraction)
 * and `SearchRiseSet` (upper-limb crossing with standard refraction, scaled by air density at the
 * observer's elevation).
 */
export function sunEvents(dateStr: string, site: Site): SunEvents {
  const obs = toObserver(site);
  const start = kstNoon(dateStr);
  const sunset = SearchRiseSet(Body.Sun, obs, -1, start, 1)?.date ?? null;
  const descending = {} as Record<SunAltitude, Date | null>;
  for (const alt of SUN_ALTITUDES) {
    descending[alt] = SearchAltitude(Body.Sun, obs, -1, start, 1, alt)?.date ?? null;
  }
  return { sunset, descending };
}

/** Geometric (no refraction) topocentric altitude of the Sun's centre, degrees. */
export function sunAltitude(date: Date, site: Site): number {
  const obs = toObserver(site);
  const eq = Equator(Body.Sun, date, obs, true, true);
  return Horizon(date, obs, eq.ra, eq.dec).altitude;
}

/** Sun azimuth (deg from north through east) and geometric altitude (deg) — same method as sunAltitude. */
export function sunAzAlt(date: Date, site: Site): { azimuth: number; altitude: number } {
  const obs = toObserver(site);
  const eq = Equator(Body.Sun, date, obs, true, true);
  const h = Horizon(date, obs, eq.ra, eq.dec);
  return { azimuth: h.azimuth, altitude: h.altitude };
}
