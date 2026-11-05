import { STARLINK_LAUNCH_VERSION } from './starlink-versions';

/**
 * Predicted visual magnitude of a satellite — deliberately simple and transparent:
 *
 *     m = M₁₀₀₀ + 5·log₁₀(d / 1000 km) − 2.5·log₁₀ F(φ)
 *
 *   M₁₀₀₀ : intrinsic magnitude at 1000 km range (table below, each value cited)
 *   d     : observer–satellite range (km)
 *   φ     : solar phase angle (angle Sun–satellite–observer)
 *   F(φ)  : phase law, normalised to F(90°) = 1 (so M₁₀₀₀ is the magnitude of a half-lit object at 1000 km)
 *
 * Two phase laws are offered (a UI setting):
 *  - 'fraction' (default): fraction of a sphere's disc that is lit, F = 1 + cos φ.
 *      Mallama (2020), "The Brightness of OneWeb Satellites", arXiv:2012.05100, §2: the standard-magnitude
 *      phase adjustment is 2.5·log₁₀(0.5 + 0.5 cos B), "the fraction of a spherical object that is illuminated".
 *      This is also the convention of Heavens-Above's "intrinsic brightness … 50% illuminated".
 *  - 'lambert': diffuse (Lambertian) sphere, F = (π − φ)·cos φ + sin φ.
 *      McCue, Williams & Morford (1971), Planet. Space Sci. 19, 851–868, doi:10.1016/0032-0633(71)90137-1,
 *      as given in Romero-Colmenares et al. (2026), arXiv:2603.21859, Eq. 5 with p = 1. F(90°) = 1 exactly.
 *
 * Check against Heavens-Above's ISS brightness for 7 passes (tests/satellites.test.ts):
 *   fraction law: mean −0.0 … +0.1 mag, rms 0.28 mag;  Lambertian: mean ≈ 0.0, rms 0.66 mag
 *   (Lambertian is 1.0 mag fainter at phase angles ≈ 125°).
 *
 * CAVEAT (stated in the README): the Mallama & Cole values are range-adjusted means over all observed phase
 * angles, not phase-normalised standard magnitudes; Starlink satellites also scatter light forward much more
 * than a sphere (Mallama 2021). Treat predicted magnitudes as ±1 mag estimates. The project intends to
 * calibrate its real detection limit from its own photos.
 */

export type PhaseLaw = 'fraction' | 'lambert';

export interface Intrinsic {
  /** Magnitude at 1000 km range. */
  m1000: number;
  /** Short key, written to the CSV. */
  key: string;
  /** Human-readable source. */
  source: string;
  /** Set when the value needs care: unpublished, unverified, or a convention mismatch. */
  flag?: string;
}

/** Mallama, A. & Cole, R. E., "Satellite Constellation Magnitudes", https://satmags.netlify.app/ (table updated 2026-08-03). */
const MC = 'Mallama & Cole, Satellite Constellation Magnitudes (table 2026-08-03)';

export const INTRINSIC: Record<string, Intrinsic> = {
  // Row "SL-V1.0*", ref [6] Mallama 2021, arXiv:2111.09735. VisorSats (same launches era) are 7.21 — not separable here.
  'starlink-v1': { m1000: 5.89, key: 'SL-V1.0', source: `${MC}; Mallama 2021 arXiv:2111.09735`, flag: 'v1 includes VisorSats (7.21, ~1.3 mag fainter) which cannot be told apart by launch' },
  // Row "SL-V1.5*", marked ** = unpublished by the table's authors.
  'starlink-v1.5': { m1000: 6.34, key: 'SL-V1.5', source: MC, flag: 'UNPUBLISHED value (marked ** in the table)' },
  // Row "SL-Mini-550*", ref [7] Mallama et al. 2023, arXiv:2306.06657. (The 475-km shell row, 7.35, is unpublished.)
  'starlink-mini': { m1000: 7.22, key: 'SL-Mini-550', source: `${MC}; Mallama et al. 2023 arXiv:2306.06657` },
  // Row "SL-Mini-DTC", ref [1] Mallama, Cole, Respler & Harrington 2025, arXiv:2502.03651.
  'starlink-dtc': { m1000: 6.74, key: 'SL-Mini-DTC', source: `${MC}; Mallama et al. 2025 arXiv:2502.03651` },
  // Row "OneWeb", ref [5] Mallama 2022, arXiv:2203.05513.
  oneweb: { m1000: 7.41, key: 'OneWeb', source: `${MC}; Mallama 2022 arXiv:2203.05513` },
  // Row "Amazon Leo", ref [3] Mallama et al. 2026, arXiv:2601.07708. CelesTrak names these satellites KUIPER-*.
  kuiper: { m1000: 6.86, key: 'AmazonLeo', source: `${MC}; Mallama et al. 2026 arXiv:2601.07708` },
  // Row "Qianfan", ref [4] Mallama et al. 2025, arXiv:2505.07194.
  qianfan: { m1000: 5.42, key: 'Qianfan', source: `${MC}; Mallama et al. 2025 arXiv:2505.07194` },
  // Heavens-Above satellite page for 25544: "Intrinsic brightness −1.8 (at 1000 km distance, 50% illuminated)".
  iss: {
    m1000: -1.8,
    key: 'ISS',
    source: 'Heavens-Above, ISS satellite information page (satid=25544)',
    flag: 'web value read from a search-engine copy of the page (site unreachable when checked); confirm on heavens-above.com',
  },
};

export interface MagObject {
  norad: number;
  name: string;
  /** International designator, e.g. '2023-028A'. */
  cospar?: string;
}

/** Intrinsic magnitude for an object, or null when no published value applies (shown as "unknown"). */
export function intrinsicFor(o: MagObject): Intrinsic | null {
  if (o.norad === 25544) return INTRINSIC.iss;
  const name = o.name.toUpperCase();
  if (name.startsWith('STARLINK')) {
    if (name.includes('[DTC]')) return INTRINSIC['starlink-dtc'];
    const v = o.cospar ? STARLINK_LAUNCH_VERSION[o.cospar.slice(0, 8)] : undefined;
    if (v === 'v1') return INTRINSIC['starlink-v1'];
    if (v === 'v1.5') return INTRINSIC['starlink-v1.5'];
    if (v === 'v2 mini') return INTRINSIC['starlink-mini'];
    return null; // v0.9, v3, '(?)', or a launch newer than the table
  }
  if (name.startsWith('ONEWEB')) return INTRINSIC.oneweb;
  if (name.startsWith('KUIPER')) return INTRINSIC.kuiper;
  if (name.startsWith('QIANFAN')) return INTRINSIC.qianfan;
  return null;
}

/** −2.5·log₁₀ F(φ), normalised to 0 at φ = 90°. φ in radians. */
export function phaseTerm(phi: number, law: PhaseLaw = 'fraction'): number {
  const f = law === 'lambert' ? (Math.PI - phi) * Math.cos(phi) + Math.sin(phi) : 1 + Math.cos(phi);
  return f > 1e-6 ? -2.5 * Math.log10(f) : 99;
}

export function visualMagnitude(m1000: number, rangeKm: number, phi: number, law: PhaseLaw = 'fraction'): number {
  return m1000 + 5 * Math.log10(rangeKm / 1000) + phaseTerm(phi, law);
}
