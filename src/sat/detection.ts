/**
 * Detection limit for a trailed satellite.
 *
 * A star's light falls on a PSF-sized spot for the whole exposure t. A satellite moving at apparent angular speed ω
 * spreads its light along a trail of length L = ω·t / (pixel scale) pixels, so each PSF-sized resolution element
 * receives light only for t_eff = FWHM / (ω / pixel scale) — the time the trail needs to cross one PSF width.
 * Its peak brightness therefore equals that of a star fainter by 2.5·log₁₀(t / t_eff) = 2.5·log₁₀(L / FWHM):
 *
 *     m_lim,sat = m_lim,star − 2.5·log₁₀(L / FWHM)        (no loss when L ≤ FWHM)
 *
 * Source: Hainaut, O. R. & Williams, A. P. (2020), "On the impact of satellite constellations on astronomical
 * observations with ESO telescopes in the visible and infrared domains", A&A 636, A121,
 * doi:10.1051/0004-6361/202037501, §5: for 1″ seeing "the length of the trail in arcsec will give the attenuation
 * factor in magnitude", 2.5·log(v); effective magnitude defined so that "a field star with that magnitude will have
 * the same peak brightness as the satellite in that exposure" (Fig. 11 caption). Here the 1″ seeing is generalised to
 * the PSF FWHM and lengths are measured in pixels. It is a peak-brightness criterion; it ignores that a detector
 * (or a person) may integrate along a long trail, so it is conservative for long streaks.
 *
 * All limits are PLACEHOLDERS until calibrated from the project's own photos.
 */

export type DetectionMode = 'trailing' | 'fixed';

export interface DetectionSettings {
  mode: DetectionMode;
  /** Limiting magnitude for a point source (star) in one frame of `exposureS` (placeholder). */
  starLimit: number;
  /** Old simple criterion: predicted magnitude ≤ fixedLimit (placeholder). */
  fixedLimit: number;
  /** PSF full width at half maximum, pixels. */
  fwhmPx: number;
  /** Pixels across the sensor width (Sony a7 III: 6000 × 4000 effective pixels). */
  pixelsAcross: number;
  sensorWidthMm: number;
  focalLengthMm: number;
  exposureS: number;
}

/** Angular size of one pixel, degrees: atan(pixel pitch / focal length). */
export function pixelScaleDeg(sensorWidthMm: number, pixelsAcross: number, focalLengthMm: number): number {
  return (Math.atan(sensorWidthMm / pixelsAcross / focalLengthMm) * 180) / Math.PI;
}

export function trailLengthPx(omegaDegS: number, exposureS: number, pxScaleDeg: number): number {
  return (omegaDegS * exposureS) / pxScaleDeg;
}

/** 2.5·log₁₀(L / FWHM), or 0 when the trail is no longer than the PSF. */
export function trailingLoss(trailPx: number, fwhmPx: number): number {
  return trailPx > fwhmPx ? 2.5 * Math.log10(trailPx / fwhmPx) : 0;
}

export interface Detectability {
  /** Brightest predicted magnitude in the frame (null = unknown intrinsic magnitude). */
  mag: number | null;
  /** Trail length in one exposure (px) at the most detectable sample. */
  trailPx: number | null;
  /** Limit that applies to this crossing: m_lim,sat (trailing mode) or the fixed limit. */
  limit: number | null;
  /** null when the brightness is unknown. */
  detectable: boolean | null;
}

export function evaluateDetection(
  x: { m1000: number | null; magRel: number; trailRel: number; omegaDegS: number },
  assumedM1000: number | null,
  s: DetectionSettings,
): Detectability {
  const m1000 = x.m1000 ?? assumedM1000;
  const ps = pixelScaleDeg(s.sensorWidthMm, s.pixelsAcross, s.focalLengthMm);
  const trailPx = Number.isFinite(x.omegaDegS) ? trailLengthPx(x.omegaDegS, s.exposureS, ps) : null;
  if (m1000 === null || !Number.isFinite(x.magRel)) return { mag: null, trailPx, limit: null, detectable: null };
  const mag = m1000 + x.magRel;
  if (s.mode === 'fixed') return { mag, trailPx, limit: s.fixedLimit, detectable: mag <= s.fixedLimit };
  if (trailPx === null || !Number.isFinite(x.trailRel)) return { mag, trailPx, limit: s.starLimit, detectable: mag <= s.starLimit };
  const limit = s.starLimit - trailingLoss(trailPx, s.fwhmPx);
  // Effective (peak-equivalent) magnitude at the most detectable sample:
  // m + 2.5·log₁₀(L/FWHM) = m1000 + [magRel + 2.5·log₁₀ω] + 2.5·log₁₀(t / (pixel scale · FWHM)).
  const eff = trailPx > s.fwhmPx ? m1000 + x.trailRel + 2.5 * Math.log10(s.exposureS / (ps * s.fwhmPx)) : mag;
  return { mag, trailPx, limit, detectable: eff <= s.starLimit };
}
