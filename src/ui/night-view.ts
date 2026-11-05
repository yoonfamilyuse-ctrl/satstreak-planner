import { BANDS, CAMERA, WINDOW_MARGIN_MIN } from '../config';
import type { NightPlan } from '../astro/schedule';
import { compass } from '../astro/moon';
import { sunAltitude, SUN_ALTITUDES, type SunAltitude } from '../astro/sun';
import type { CloudAverage } from '../weather/openmeteo';
import { fmtDuration, fmtHM, fmtHMS } from '../time';
import { cloudText, deg, esc, moonIcon, OPEN_METEO_ATTRIBUTION } from './util';

/** Night schedule view (Stage 1). `cloud` is the forecast average over the window, if available. */
export function renderNight(p: NightPlan, cloud: CloudAverage | null | undefined): string {
  return [warnings(p), windowCard(p, cloud), timelineCard(p), sunCard(p), moonCard(p)].join('');
}

function warnings(p: NightPlan): string {
  return p.warnings.map((w) => `<div class="warn" role="alert">${esc(w)}</div>`).join('');
}

function windowCard(p: NightPlan, cloud: CloudAverage | null | undefined): string {
  const w = p.window;
  if (!w) return `<section class="card"><h2>Shooting window</h2><p>No complete window this night (see warning above).</p></section>`;
  const d = p.dateStr;
  const bands = p.bands
    .map(
      (b) => `<div class="band ${b.key}"><span><b>${esc(b.label)}</b> ${b.from}° → ${b.to}°</span>
        <span class="tnum">${fmtHM(b.start, d)}–${fmtHM(b.end, d)} · ${b.start && b.end ? fmtDuration(b.end.getTime() - b.start.getTime()) : '—'} · ${b.frames ?? '—'} frames${b.plannedFirst ? ` (${b.plannedFirst}–${b.plannedLast})` : ''}</span></div>`,
    )
    .join('');
  return `<section class="card">
    <h2>Recommended shooting window</h2>
    <div class="hero"><div class="range tnum">${fmtHM(w.start, d)} → ${fmtHM(w.end, d)}</div></div>
    <div class="stats">
      <div class="stat"><div class="k">Duration</div><div class="v tnum">${fmtDuration(w.durationMs)}</div><div class="s tnum">${Math.round(w.durationMs / 1000)} s</div></div>
      <div class="stat"><div class="k">Number of Shots</div><div class="v tnum">${w.shots}</div><div class="s">${CAMERA.exposureS} s exposure, ${CAMERA.intervalS} s interval</div></div>
    </div>
    <div class="bands">${bands}</div>
    ${cloud !== undefined ? `<p class="cloud-line">Cloud forecast (window mean): <b>${cloudText(cloud)}</b><br>${OPEN_METEO_ATTRIBUTION} (CC BY 4.0)</p>` : ''}
    <p class="note">Window = ${WINDOW_MARGIN_MIN} min before the Sun reaches ${BANDS.twilight.from}° to ${WINDOW_MARGIN_MIN} min after it reaches ${BANDS.dark.to}°. Shots = ⌈duration ÷ ${CAMERA.intervalS} s⌉.</p>
  </section>`;
}

function timelineCard(p: NightPlan): string {
  if (!p.window) return '';
  const d = p.dateStr;
  const rows = p.timeline
    .map((it) => {
      const band = it.kind === 'band' ? (it.label.startsWith(BANDS.twilight.label) ? 'twilight' : 'dark') : '';
      const key = /^(Start|End) shooting/.test(it.label) ? 'key' : '';
      return `<tr class="${it.kind === 'band' ? `band-row ${band}` : ''} ${key}">
        <td class="t tnum">${fmtHM(it.time, d)}</td><td>${esc(it.label)}</td><td class="r tnum">${it.frame ?? ''}</td></tr>`;
    })
    .join('');
  return `<section class="card"><h2>Field timeline</h2>
    <table><thead><tr><th>KST</th><th>Step</th><th class="r">Frame #</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">Frame # (if shooting starts exactly on time): for tasks, the frame being exposed at that moment; for band rows, the band’s first or last frame. A frame belongs to a band if the Sun’s altitude at its mid-exposure (frame start + exposure/2) is inside the band. Use the time.is photos to correct for the camera clock.</p>
  </section>`;
}

const SUN_LABELS: Record<SunAltitude, string> = {
  [-6]: 'Civil twilight ends',
  [-12]: 'Nautical twilight ends · twilight band starts',
  [-18]: 'Astronomical twilight ends',
  [-20]: 'Twilight band ends',
  [-25]: 'Dark band starts',
  [-35]: 'Dark band ends',
};

function sunCard(p: NightPlan): string {
  const d = p.dateStr;
  const rowClass = (a: SunAltitude) => (a === -12 || a === -20 ? 'twilight key' : a === -25 || a === -35 ? 'dark key' : '');
  const rows = [
    `<tr><td>Sunset <span class="sec">(upper limb, refraction)</span></td><td class="r tnum">−0.8°</td><td class="t r tnum">${fmtHM(p.sun.sunset, d)} <span class="sec">${fmtHMS(p.sun.sunset, d).slice(5, 8)}</span></td></tr>`,
    ...SUN_ALTITUDES.map(
      (a) => `<tr class="${rowClass(a)}"><td>${SUN_LABELS[a]}</td><td class="r tnum">${a}°</td>
        <td class="t r tnum">${fmtHM(p.sun.descending[a], d)} <span class="sec">${p.sun.descending[a] ? fmtHMS(p.sun.descending[a], d).slice(5, 8) : ''}</span></td></tr>`,
    ),
  ].join('');
  return `<section class="card"><h2>Sun</h2>
    <table><thead><tr><th>Event</th><th class="r">Sun alt.</th><th class="r">KST</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">Sunset: Sun’s upper limb at the horizon with standard refraction (−0.8° for the centre). Other rows: geometric altitude of the Sun’s centre, no refraction (standard twilight definition). Cross-check −6°, −12°, −18° and sunset against KASI (astro.kasi.re.kr) or timeanddate.com.</p>
  </section>`;
}

function moonCard(p: NightPlan): string {
  const m = p.moon;
  const d = p.dateStr;
  const w = p.window;
  const upTxt = w ? `${m.minutesUp} of ${Math.round(w.durationMs / 60000)} min` : '—';
  const rows = m.samples
    .map((s) => {
      const sa = sunAltitude(s.time, p.site);
      const band = sa <= BANDS.twilight.from && sa >= BANDS.twilight.to ? 'twilight' : sa <= BANDS.dark.from && sa >= BANDS.dark.to ? 'dark' : '';
      return `<tr class="${band}"><td class="t tnum">${fmtHM(s.time, d)}</td><td class="r tnum">${deg(sa)}</td>
        <td class="r tnum">${s.altitude > 0 ? deg(s.altitude) : `<span class="sec">${deg(s.altitude)}</span>`}</td>
        <td class="r tnum">${deg(s.azimuth, 0)} ${compass(s.azimuth)}</td></tr>`;
    })
    .join('');
  return `<section class="card"><h2>Moon</h2>
    <div class="moon-head">${moonIcon(m.illuminationPct, m.waxing)}
      <div><div class="big tnum">${m.illuminationPct.toFixed(0)}% lit</div><div class="sec">${m.phaseName} · at ${fmtHM(m.phaseAt, d)}</div></div></div>
    <dl class="kv">
      <dt>Moonrise</dt><dd class="tnum">${fmtHM(m.rise, d)}</dd>
      <dt>Moonset</dt><dd class="tnum">${fmtHM(m.set, d)}</dd>
      <dt>Up during window</dt><dd class="tnum">${upTxt}${m.maxAltitude !== null ? ` · max alt ${deg(m.maxAltitude)}` : ''}</dd>
    </dl>
    ${
      rows
        ? `<div class="scroll-x" style="margin-top:12px"><table><thead><tr><th>KST</th><th class="r">Sun alt.</th><th class="r">Moon alt.</th><th class="r">Moon az.</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : ''
    }
    <p class="note">Rise/set: next events after 12:00 KST of the date (within 24 h; “(+1d)” = next day). Moon altitude is apparent (topocentric, with refraction); negative = below horizon. Azimuth from north through east. Rows tinted by solar band.</p>
  </section>`;
}

