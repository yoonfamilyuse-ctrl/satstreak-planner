/**
 * Independent solar-elevation implementation used ONLY to cross-check astronomy-engine in tests.
 * Formulas: NOAA Global Monitoring Laboratory "Solar Calculator" spreadsheet
 * (https://gml.noaa.gov/grad/solcalc/calcdetails.html), which implements
 * J. Meeus, "Astronomical Algorithms" (Willmann-Bell, 1991), ch. 25 (low-precision solar coordinates)
 * and the equation of time. Geometric elevation, no refraction. Accuracy ≈ 0.01–0.02°.
 */
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

export function noaaSolarElevation(date: Date, latDeg: number, lonDeg: number): number {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const T = (jd - 2451545) / 36525; // Julian centuries since J2000.0
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360); // mean longitude
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T); // mean anomaly
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T); // eccentricity
  const Mr = rad(M);
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega)); // apparent longitude
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega)); // corrected obliquity
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const L0r = rad(L0);
  const eqTimeMin =
    4 * deg(y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const minutesUTC = mod(date.getTime() / 60_000, 1440);
  const trueSolarTime = mod(minutesUTC + eqTimeMin + 4 * lonDeg, 1440);
  const hourAngle = trueSolarTime / 4 - 180;
  const cosZen = Math.sin(rad(latDeg)) * Math.sin(decl) + Math.cos(rad(latDeg)) * Math.cos(decl) * Math.cos(rad(hourAngle));
  return 90 - deg(Math.acos(cosZen));
}
