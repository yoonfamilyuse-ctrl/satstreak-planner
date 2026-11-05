import type { CloudAverage } from '../weather/openmeteo';
import { compass } from '../astro/moon';
import { S } from '../i18n';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const deg = (x: number, digits = 1) => `${x.toFixed(digits)}°`;

export function cloudText(c: CloudAverage | null): string {
  if (!c) return S().common.cloudNone;
  const r = Math.round;
  return S().common.cloud(r(c.total), r(c.low), r(c.mid), r(c.high));
}

/** Compass point (N, NNE, …) of an azimuth, in the current language. */
export const dir = (az: number) => {
  const c = compass(az);
  return S().common.compass[c] ?? c;
};

/** Moon phase glyph. Lit limb on the right when waxing (northern-hemisphere view). */
export function moonIcon(illum: number, waxing: boolean, size = 48): string {
  const r = 22;
  const k = illum / 100;
  const rx = Math.abs(1 - 2 * k) * r;
  const s = waxing ? 1 : 0;
  const termSweep = k > 0.5 ? s : 1 - s;
  const lit = k < 0.005 ? '' : `<path d="M 24 2 A ${r} ${r} 0 0 ${s} 24 46 A ${rx} ${r} 0 0 ${termSweep} 24 2 Z" fill="currentColor"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".45"/>${lit}</svg>`;
}

/** Open-Meteo data are CC BY 4.0: attribution must accompany every display of cloud data. */
export const openMeteoAttribution = () =>
  `<a class="attrib" href="https://open-meteo.com/" target="_blank" rel="noopener">${S().common.attribution}</a>`;
