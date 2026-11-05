import { Observer } from 'astronomy-engine';
import type { Site } from '../config';

/**
 * astronomy-engine Observer for a site.
 * Library: astronomy-engine v2.1.19 (Don Cross, MIT licence), https://github.com/cosinekitty/astronomy
 * Models used by the library (see its source / README):
 *  - Earth/Sun: VSOP87 (Bretagnon & Francou 1988).
 *  - Moon: the Nautical Almanac Office's "Improved Lunar Ephemeris" (1954), from E. W. Brown's
 *    lunar theory, as adapted in Montenbruck & Pfleger, "Astronomy on the Personal Computer".
 *  - Nutation: IAU 2000B. ΔT: Espenak & Meeus polynomial expressions.
 *  - Refraction ('normal'): Saemundsson's formula, Meeus "Astronomical Algorithms" (1991) pp. 101–102.
 * The library authors report agreement with NOVAS and JPL Horizons to about ±1 arcminute.
 */
export function toObserver(site: Site): Observer {
  return new Observer(site.latitude, site.longitude, site.elevation);
}
