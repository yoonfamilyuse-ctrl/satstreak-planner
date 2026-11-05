import type { BandKey, Track } from '../sat/predict';
import { S } from '../i18n';

/**
 * All-sky chart: zenith at the centre, horizon on the rim, radius ∝ zenith distance (azimuthal equidistant).
 * North up, East LEFT (as seen when lying on your back looking up).
 */
const R = 100;

export function skyXY(az: number, alt: number): [number, number] {
  const r = ((90 - Math.max(alt, 0)) / 90) * R;
  const a = (az * Math.PI) / 180;
  return [-r * Math.sin(a), -r * Math.cos(a)];
}

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

export interface SkyChartInput {
  tracks: Track[];
  fov: { az: number; alt: number }[];
  moon: { az: number; alt: number } | null;
  /** Highlight tracks of these bands; others drawn faint. */
}

export function skyChart(inp: SkyChartInput): string {
  const rings = [0, 30, 60]
    .map((alt) => `<circle r="${(((90 - alt) / 90) * R).toFixed(1)}" class="sc-ring"/>`)
    .join('');
  const spokes = [0, 45, 90, 135]
    .map((az) => {
      const [x, y] = skyXY(az, 0);
      return `<line x1="${x}" y1="${y}" x2="${-x}" y2="${-y}" class="sc-ring"/>`;
    })
    .join('');
  const labels = (
    [
      ['N', 0],
      ['E', 90],
      ['S', 180],
      ['W', 270],
    ] as const
  )
    .map(([t, az]) => {
      const [x, y] = skyXY(az, -9);
      const [lx, ly] = [x * 1.09, y * 1.09];
      return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="sc-label" text-anchor="middle" dominant-baseline="central">${S().sats.compassLetters[t] ?? t}</text>`;
    })
    .join('');
  const altLabels = [30, 60]
    .map((alt) => `<text x="2" y="${(-((90 - alt) / 90) * R + 4).toFixed(1)}" class="sc-small">${alt}°</text>`)
    .join('');

  const cls = (b: BandKey) => (b === 'twilight' ? 'sc-tw' : b === 'dark' ? 'sc-dk' : 'sc-ot');
  // Draw "other" first so band tracks sit on top.
  const order: BandKey[] = ['outside', 'gap', 'twilight', 'dark'];
  const tracks = order
    .flatMap((b) =>
      inp.tracks
        .filter((t) => t.band === b)
        .flatMap((t) => t.segments.filter((s) => s.length > 1).map((s) => `<polyline class="sc-track ${cls(b)}" points="${pts(s.map(([az, alt]) => skyXY(az, alt)))}"/>`)),
    )
    .join('');

  const fov = inp.fov.length ? `<polygon class="sc-fov" points="${pts(inp.fov.map((p) => skyXY(p.az, p.alt)))}"/>` : '';
  let moon = '';
  if (inp.moon && inp.moon.alt > 0) {
    const [x, y] = skyXY(inp.moon.az, inp.moon.alt);
    moon = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="sc-moon"/><text x="${(x + 7).toFixed(1)}" y="${(y + 3).toFixed(1)}" class="sc-small">${S().sats.moonLabel}</text>`;
  }

  return `<svg class="skychart" viewBox="-118 -118 236 236" role="img" aria-label="${S().sats.chartAria}">
    <circle r="${R}" class="sc-bg"/>${rings}${spokes}${tracks}${fov}${moon}${labels}${altLabels}
  </svg>
  <div class="sc-legend">
    <span><i class="sw sc-tw"></i>${S().sats.legTwilight}</span>
    <span><i class="sw sc-dk"></i>${S().sats.legDark}</span>
    <span><i class="sw sc-ot"></i>${S().sats.legOther}</span>
    <span><i class="sw sc-fovsw"></i>${S().sats.legFrame}</span>
  </div>
  <p class="note">${S().sats.chartNote}</p>`;
}
