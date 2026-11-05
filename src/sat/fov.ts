/**
 * Camera field of view and gnomonic projection.
 *
 * FOV of a rectilinear lens focused at infinity: θ = 2·atan(d / 2f), d = sensor side, f = focal length.
 * Sony a7 III sensor 35.9 × 24.0 mm at f = 28 mm → 65.3° × 46.4°.
 *
 * A rectilinear lens images the sky by gnomonic (central) projection, so "inside the frame" is tested by
 * projecting the target's (azimuth, altitude) onto the tangent plane at the camera's pointing direction
 * and comparing with the sensor half-extents tan(θ/2).
 * Formulas: J. P. Snyder, "Map Projections — A Working Manual", USGS Professional Paper 1395 (1987),
 * gnomonic projection, eqs. (5-3), (22-4), (22-5) (forward) and (20-14), (20-15), (22-16) (inverse),
 * with longitude → azimuth and latitude → altitude. Camera roll is zero (landscape, horizon level);
 * x increases with azimuth (to the right when facing the target), y increases with altitude (up).
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export interface Camera {
  /** Pointing azimuth, degrees from north through east. */
  azimuth: number;
  /** Pointing altitude, degrees. */
  altitude: number;
  focalLength: number;
  sensorWidth: number;
  sensorHeight: number;
}

export const DEFAULT_CAMERA: Camera = { azimuth: 180, altitude: 60, focalLength: 28, sensorWidth: 35.9, sensorHeight: 24.0 };

export function fieldOfView(c: Pick<Camera, 'focalLength' | 'sensorWidth' | 'sensorHeight'>) {
  const f = (d: number) => 2 * Math.atan(d / (2 * c.focalLength)) * R2D;
  return { horizontal: f(c.sensorWidth), vertical: f(c.sensorHeight), diagonal: f(Math.hypot(c.sensorWidth, c.sensorHeight)) };
}

export interface Fov {
  az0: number; // rad
  sinAlt0: number;
  cosAlt0: number;
  tanHalfW: number;
  tanHalfH: number;
}

export function makeFov(c: Camera): Fov {
  const a = c.altitude * D2R;
  return {
    az0: c.azimuth * D2R,
    sinAlt0: Math.sin(a),
    cosAlt0: Math.cos(a),
    tanHalfW: c.sensorWidth / (2 * c.focalLength),
    tanHalfH: c.sensorHeight / (2 * c.focalLength),
  };
}

/** Gnomonic tangent-plane coordinates (units of focal length); null if ≥ 90° from the optical axis. */
export function gnomonic(fov: Fov, azRad: number, altRad: number): { x: number; y: number } | null {
  const sinA = Math.sin(altRad);
  const cosA = Math.cos(altRad);
  const dAz = azRad - fov.az0;
  const cosDAz = Math.cos(dAz);
  const cosC = fov.sinAlt0 * sinA + fov.cosAlt0 * cosA * cosDAz;
  if (cosC <= 0) return null;
  return { x: (cosA * Math.sin(dAz)) / cosC, y: (fov.cosAlt0 * sinA - fov.sinAlt0 * cosA * cosDAz) / cosC };
}

export function inFov(fov: Fov, azRad: number, altRad: number): boolean {
  const p = gnomonic(fov, azRad, altRad);
  return p !== null && Math.abs(p.x) <= fov.tanHalfW && Math.abs(p.y) <= fov.tanHalfH;
}

/** Inverse gnomonic: tangent-plane (x, y) → (azimuth, altitude) in degrees. */
export function inverseGnomonic(fov: Fov, x: number, y: number): { az: number; alt: number } {
  const rho = Math.hypot(x, y);
  if (rho === 0) return { az: fov.az0 * R2D, alt: Math.asin(fov.sinAlt0) * R2D };
  const c = Math.atan(rho);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const alt = Math.asin(cosC * fov.sinAlt0 + (y * sinC * fov.cosAlt0) / rho);
  const az = fov.az0 + Math.atan2(x * sinC, rho * fov.cosAlt0 * cosC - y * fov.sinAlt0 * sinC);
  return { az: (((az * R2D) % 360) + 360) % 360, alt: alt * R2D };
}

/** Frame outline as (az, alt) points, for plotting. */
export function fovOutline(fov: Fov, perEdge = 24): { az: number; alt: number }[] {
  const W = fov.tanHalfW;
  const H = fov.tanHalfH;
  const pts: { az: number; alt: number }[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < perEdge; i++) {
      const t = i / perEdge;
      pts.push(inverseGnomonic(fov, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
    }
  };
  edge(-W, H, W, H);
  edge(W, H, W, -H);
  edge(W, -H, -W, -H);
  edge(-W, -H, -W, H);
  return pts;
}

/** 8 azimuths × altitudes 45° and 60° for the pointing comparison table. */
export function pointingGrid(base: Camera): Camera[] {
  const out: Camera[] = [];
  for (const altitude of [45, 60]) for (let az = 0; az < 360; az += 45) out.push({ ...base, azimuth: az, altitude });
  return out;
}

/** Great-circle angle between two (azimuth, altitude) directions, degrees (spherical law of cosines). */
export function angularSeparation(az1: number, alt1: number, az2: number, alt2: number): number {
  const a1 = alt1 * D2R;
  const a2 = alt2 * D2R;
  const c = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos((az1 - az2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}

/** Absolute azimuth difference folded to 0–180°. */
export function azimuthDifference(az1: number, az2: number): number {
  const d = Math.abs((((az1 - az2) % 360) + 540) % 360 - 180);
  return d;
}
