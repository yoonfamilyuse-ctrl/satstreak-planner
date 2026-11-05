/**
 * Detection limit for a trailed satellite — two published models, evaluated side by side on the SAME inputs
 * (each in-frame 10-s sample's predicted magnitude and apparent angular speed), plus the old fixed limit.
 *
 * Trail length in one exposure, in units of the PSF FWHM:   x = L / FWHM,   L = ω·t_exp / (pixel scale)  [px]
 *
 * 1) PEAK (Hainaut & Williams 2020):
 *        m_lim,sat = m_lim,star − 2.5·log₁₀(x)            (no loss when x ≤ 1)
 *    Hainaut, O. R. & Williams, A. P. (2020), A&A 636, A121, doi:10.1051/0004-6361/202037501, §5: for 1″ seeing
 *    "the length of the trail in arcsec will give the attenuation factor in magnitude", 2.5·log(v); effective
 *    magnitude = that of "a field star [with] the same peak brightness as the satellite in that exposure"
 *    (Fig. 11 caption). Generalised here from 1″ seeing to the PSF FWHM, lengths in pixels.
 *
 * 2) MATCHED FILTER (Jones et al. 2018, SNR trailing loss):
 *        m_lim,sat = m_lim,star − 1.25·log₁₀(1 + a·x² / (1 + b·x)),   a = 0.67, b = 1.16
 *    Jones, R. L. et al. (2018), "The Large Synoptic Survey Telescope as a Near-Earth Object discovery machine",
 *    Icarus, doi:10.1016/j.icarus.2017.11.033 (arXiv:1711.10621), Eqs. (4)–(5): Δm = −1.25 log₁₀(1 + a x²/(1 + b x)),
 *    x = v·T_exp/(24·θ) with v in deg/day, T_exp in s, θ = FWHM in arcsec — i.e. x = trail length / FWHM.
 *    "For trailing SNR losses, we find a = 0.67 and b = 1.16" — the irreversible S/N loss from the larger
 *    background footprint, which applies when detection uses a filter matched to the trail. For long trails it grows
 *    as ≈ 1.25·log₁₀(x). (Their *cumulative* loss for ordinary point-source detection software, a = 0.42, b = 0,
 *    grows as ≈ 2.5·log₁₀(x), close to the PEAK model; it is not used here.)
 *    Formula reading check: at their fiducial v = 1 deg/day, 30 s, 0.7″ (x = 1.79) it gives 0.29 mag, matching the
 *    paper's "SNR loss is ∼0.3 mag".
 *
 * 3) FIXED: predicted magnitude ≤ a fixed limit (the earlier simple criterion).
 *
 * A crossing is "detectable" under a model if ANY in-frame sample satisfies m ≤ m_lim,sat for that sample.
 * All limits are PLACEHOLDERS until calibrated from the project's own photos.
 */

export type DetectionModel = 'peak' | 'matched' | 'fixed';

export const MODEL_LABEL: Record<DetectionModel, string> = {
  peak: 'Peak (Hainaut & Williams 2020)',
  matched: 'Matched filter (Jones et al. 2018 SNR loss)',
  fixed: 'Fixed limit',
};

/** Jones et al. (2018) Eq. (4) constants for trailing SNR loss. */
export const JONES_A = 0.67;
export const JONES_B = 1.16;

export interface DetectionSettings {
  /** Limiting magnitude for a point source (star) in one frame of `exposureS` (placeholder until measured). */
  starLimit: number;
  /** Fixed limit for the simple criterion (placeholder). */
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

/** PEAK loss: 2.5·log₁₀(L/FWHM), 0 when the trail is no longer than the PSF. */
export function peakLoss(trailPx: number, fwhmPx: number): number {
  return trailPx > fwhmPx ? 2.5 * Math.log10(trailPx / fwhmPx) : 0;
}
/** Backward-compatible name. */
export const trailingLoss = peakLoss;

/** MATCHED-FILTER loss: Jones et al. (2018) Eq. (4) with the SNR-loss constants. */
export function matchedLoss(trailPx: number, fwhmPx: number): number {
  const x = trailPx / fwhmPx;
  return 1.25 * Math.log10(1 + (JONES_A * x * x) / (1 + JONES_B * x));
}

export interface ModelResult {
  /** Limit at the most favourable in-frame sample (the one with the largest margin limit − m). */
  limit: number | null;
  detectable: boolean | null;
}

export interface Detectability {
  /** Brightest predicted magnitude in the frame (null = unknown intrinsic magnitude). */
  mag: number | null;
  /** Trail length in one exposure at the brightest sample (px). */
  trailPx: number | null;
  peak: ModelResult;
  matched: ModelResult;
  fixed: ModelResult;
}

/** Per in-frame sample: [geometric magnitude part (magRel), apparent angular speed ω in deg/s]. */
export type Sample = [number, number];

export function evaluateDetection(
  x: { m1000: number | null; samples: Sample[] },
  assumedM1000: number | null,
  s: DetectionSettings,
): Detectability {
  const m1000 = x.m1000 ?? assumedM1000;
  const ps = pixelScaleDeg(s.sensorWidthMm, s.pixelsAcross, s.focalLengthMm);
  const valid = x.samples.filter(([rel, w]) => Number.isFinite(rel) && Number.isFinite(w));
  let brightest: Sample | null = null;
  for (const smp of valid) if (!brightest || smp[0] < brightest[0]) brightest = smp;
  const trailPx = brightest ? trailLengthPx(brightest[1], s.exposureS, ps) : null;
  const none: ModelResult = { limit: null, detectable: null };
  if (m1000 === null || !brightest) return { mag: null, trailPx, peak: none, matched: none, fixed: none };
  const mag = m1000 + brightest[0];
  const best = (loss: (L: number) => number): ModelResult => {
    let margin = -Infinity;
    let limit = NaN;
    for (const [rel, w] of valid) {
      const lim = s.starLimit - loss(trailLengthPx(w, s.exposureS, ps));
      const mg = lim - (m1000 + rel);
      if (mg > margin) {
        margin = mg;
        limit = lim;
      }
    }
    return { limit, detectable: margin >= 0 };
  };
  return {
    mag,
    trailPx,
    peak: best((L) => peakLoss(L, s.fwhmPx)),
    matched: best((L) => matchedLoss(L, s.fwhmPx)),
    fixed: { limit: s.fixedLimit, detectable: mag <= s.fixedLimit },
  };
}
