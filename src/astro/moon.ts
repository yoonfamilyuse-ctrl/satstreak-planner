import { Body, Equator, Horizon, Illumination, MoonPhase, SearchRiseSet } from 'astronomy-engine';
import type { Site } from '../config';
import { kstNoon, MIN_MS } from '../time';
import { toObserver } from './observer';

export interface MoonPosition {
  /** Apparent topocentric altitude, degrees, standard refraction ("normal" model in astronomy-engine). */
  altitude: number;
  /** Azimuth, degrees, measured from north through east. */
  azimuth: number;
}

export interface MoonSample extends MoonPosition {
  time: Date;
}

export interface MoonInfo {
  /** Illuminated fraction of the disc × 100, at `phaseAt`. */
  illuminationPct: number;
  /** Ecliptic longitude difference Moon − Sun, degrees (0 new, 90 first quarter, 180 full, 270 last quarter). */
  phaseAngle: number;
  phaseName: string;
  waxing: boolean;
  phaseAt: Date;
  /** Next moonrise / moonset after noon KST of the date, within 24 h (null if none). */
  rise: Date | null;
  set: Date | null;
  /** Position samples across the shooting window (empty if no window). */
  samples: MoonSample[];
  /** Minutes (1-minute sampling) the Moon's centre is above the horizon during the window. */
  minutesUp: number;
  maxAltitude: number | null;
}

/**
 * Topocentric apparent position of the Moon.
 * Uses astronomy-engine `Equator(Body.Moon, t, observer, ofdate=true, aberration=true)`, which
 * includes lunar parallax (~1° — significant for the Moon), then `Horizon(..., 'normal')` which
 * adds refraction by Saemundsson's formula (Meeus, Astronomical Algorithms, 1991, pp. 101–102).
 */
export function moonPosition(date: Date, site: Site): MoonPosition {
  const obs = toObserver(site);
  const eq = Equator(Body.Moon, date, obs, true, true);
  const hor = Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { altitude: hor.altitude, azimuth: hor.azimuth };
}

export function phaseName(angle: number): string {
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.floor(((angle + 22.5) % 360) / 45)];
}

/**
 * Moon information for the evening of `dateStr`.
 * Illumination: astronomy-engine `Illumination(Body.Moon, t).phase_fraction` (fraction of the disc lit,
 * from the Sun–Moon–Earth phase angle). Phase angle: `MoonPhase(t)` (Moon − Sun geocentric ecliptic longitude).
 * Rise/set: `SearchRiseSet` (upper limb, refraction, parallax included).
 */
export function moonInfo(dateStr: string, site: Site, window: { start: Date; end: Date } | null, stepMin = 10): MoonInfo {
  const obs = toObserver(site);
  const noon = kstNoon(dateStr);
  const phaseAt = window ? new Date((window.start.getTime() + window.end.getTime()) / 2) : new Date(noon.getTime() + 9 * 60 * MIN_MS);
  const illuminationPct = Illumination(Body.Moon, phaseAt).phase_fraction * 100;
  const phaseAngle = MoonPhase(phaseAt);
  const rise = SearchRiseSet(Body.Moon, obs, +1, noon, 1)?.date ?? null;
  const set = SearchRiseSet(Body.Moon, obs, -1, noon, 1)?.date ?? null;

  const samples: MoonSample[] = [];
  let minutesUp = 0;
  let maxAltitude: number | null = null;
  if (window) {
    const t0 = window.start.getTime();
    const t1 = window.end.getTime();
    for (let t = t0; t < t1; t += stepMin * MIN_MS) samples.push({ time: new Date(t), ...moonPosition(new Date(t), site) });
    samples.push({ time: new Date(t1), ...moonPosition(new Date(t1), site) });
    for (let t = t0; t < t1; t += MIN_MS) {
      const alt = moonPosition(new Date(t), site).altitude;
      if (alt > 0) minutesUp++;
      maxAltitude = maxAltitude === null ? alt : Math.max(maxAltitude, alt);
    }
  }
  return { illuminationPct, phaseAngle, phaseName: phaseName(phaseAngle), waxing: phaseAngle < 180, phaseAt, rise, set, samples, minutesUp, maxAltitude };
}

/** 16-point compass label for an azimuth in degrees. */
export function compass(az: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}
