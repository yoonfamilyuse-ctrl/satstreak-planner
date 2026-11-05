import { CRITERIA, type OutlookNight, type Rating } from '../outlook';
import { fmtHM, kstNoon } from '../time';
import { dayMonth, S, shortDate as fmtShortDate, weekday } from '../i18n';
import { cloudText, esc, moonIcon, openMeteoAttribution } from './util';

export type ForecastStatus =
  | { state: 'loading' }
  | { state: 'ok'; fetchedAt: number }
  | { state: 'error'; message: string; fetchedAt?: number };

const ratingLabel = (r: Rating) => S().outlook.rating[r] ?? r;

/**
 * 14-night outlook as a proof sheet: one row per night on a shared evening time axis. Each row's film bar spans
 * the shooting window, with both solar bands marked in grease-pencil red and the Moon's time above the horizon
 * as an amber lane (from the plan's 10-min Moon samples). Good nights are circled. Display only: windows, bands,
 * Moon and cloud averages come from the night plans and outlook.ts.
 */
export function renderOutlook(nights: OutlookNight[], fs: ForecastStatus): string {
  const O = S().outlook;
  const status = fs.state === 'loading' ? O.loading : fs.state === 'ok' ? O.fetched(fmtHM(new Date(fs.fetchedAt))) : O.failed(esc(fs.message));
  const goodCount = nights.filter((n) => n.rating === 'good').length;
  const axis = timeAxis(nights);
  const head = `<section class="block ol-head">
    <h2>${O.title}</h2>
    <p class="note">${O.good(goodCount)} ${O.tap}</p>
    <div class="fc-status"><span>${status} ${openMeteoAttribution()} (CC BY 4.0)</span><button type="button" id="fc-refresh"${fs.state === 'loading' ? ' disabled' : ''}>${O.refresh}</button></div>
  </section>`;
  const legend = `<div class="ol-legend" aria-hidden="true">
    <span><i class="lg-film"></i>${O.legWindow}</span><span><i class="lg-band"></i>${O.legBands}</span><span><i class="lg-moon"></i>${O.legMoon}</span>
  </div>
  ${axis ? `<div class="ol-axis tnum" aria-hidden="true">${axis.ticks.map((t) => `<span style="left:${t.pct}%">${t.label}</span>`).join('')}</div>` : ''}`;
  const criteria = `<details class="how"><summary>${O.criteriaTitle}</summary>
      <ul class="note">${O.criteria(CRITERIA.moonNoneMax, CRITERIA.moonLowMax, CRITERIA.cloudClearMax, CRITERIA.cloudPartlyMax).map((li) => `<li>${li}</li>`).join('')}</ul>
    </details>`;
  return `${head}<section class="block ol-sheet">${legend}<ol class="nights">${nights.map((n, i) => row(n, i, axis)).join('')}</ol>${criteria}</section>`;
}

interface Axis {
  /** Minutes after local noon of the axis start/end (shared by all rows, so windows line up). */
  from: number;
  to: number;
  ticks: { pct: number; label: string }[];
}

const minAfterNoon = (t: Date, dateStr: string) => (t.getTime() - kstNoon(dateStr).getTime()) / 60000;

function timeAxis(nights: OutlookNight[]): Axis | null {
  const ws = nights.filter((n) => n.plan.window);
  if (!ws.length) return null;
  const from = Math.floor(Math.min(...ws.map((n) => minAfterNoon(n.plan.window!.start, n.plan.dateStr))) / 30) * 30;
  const to = Math.ceil(Math.max(...ws.map((n) => minAfterNoon(n.plan.window!.end, n.plan.dateStr))) / 30) * 30;
  const ticks: Axis['ticks'] = [];
  for (let m = from; m <= to; m += 30) {
    const h = 12 + Math.floor(m / 60);
    ticks.push({ pct: ((m - from) / (to - from)) * 100, label: `${String(h % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
  }
  return { from, to, ticks };
}

function row(n: OutlookNight, i: number, axis: Axis | null): string {
  const p = n.plan;
  const w = p.window;
  const d = p.dateStr;
  const O = S().outlook;
  const winMin = w ? Math.round(w.durationMs / 60000) : 0;
  const moonUp = w ? (p.moon.minutesUp === 0 ? O.notUp : p.moon.minutesUp >= winMin ? O.upAll(winMin) : O.upOf(p.moon.minutesUp, winMin)) : '—';
  const pos = (t: Date) => (axis ? ((minAfterNoon(t, d) - axis.from) / (axis.to - axis.from)) * 100 : 0);
  let bar = `<div class="ol-bar"><span class="ol-none">${O.noSun35}</span></div>`;
  if (w && axis) {
    const bands = p.bands
      .filter((b) => b.start && b.end)
      .map((b) => `<span class="ol-band" style="left:${pos(b.start!)}%;width:${pos(b.end!) - pos(b.start!)}%"></span>`)
      .join('');
    // Moon-up lane from the 10-min samples (each sample stands for the 10 min after it).
    // Consecutive up samples are merged into one span.
    const moon: string[] = [];
    const ss = p.moon.samples;
    for (let k = 0; k < ss.length; k++) {
      if (ss[k].altitude <= 0) continue;
      let j = k;
      while (j + 1 < ss.length && ss[j + 1].altitude > 0) j++;
      const a = ss[k].time;
      const b = ss[j + 1]?.time ?? w.end;
      moon.push(`<span class="ol-moon" style="left:${pos(a)}%;width:${Math.max(0.5, pos(b) - pos(a))}%"></span>`);
      k = j;
    }
    bar = `<div class="ol-bar"><span class="ol-film" style="left:${pos(w.start)}%;width:${pos(w.end) - pos(w.start)}%"></span>${bands}${moon.join('')}</div>`;
  }
  const cloudBig = n.cloud ? `${Math.round(n.cloud.total)}%` : '—';
  return `<li class="ol-night r-${n.rating}">
    <a class="ol-link" href="#${d}" aria-label="${esc(fmtShortDate(d))}: ${ratingLabel(n.rating)}">
      <span class="ol-date"><b>${i === 0 ? O.tonight : weekday(d)}</b><span class="tnum">${dayMonth(d)}</span></span>
      <span class="ol-mid">
        ${bar}
        <span class="ol-facts tnum">${w ? O.windowShots(fmtHM(w.start, d), fmtHM(w.end, d), w.shots) : O.noWindow}</span>
        <span class="ol-facts tnum"><span class="nc-ico">${moonIcon(p.moon.illuminationPct, p.moon.waxing, 16)}</span>${O.moon(p.moon.illuminationPct.toFixed(0), moonUp, n.moonIndex !== null ? n.moonIndex.toFixed(0) : null)}</span>
      </span>
      <span class="ol-cloud c-${n.cloudClass}"><b class="tnum">${cloudBig}</b><span>${O.cloud}</span><span class="ol-rating">${ratingLabel(n.rating)}</span></span>
    </a>
    ${n.cloud ? `<span class="ol-cloud-detail tnum">${cloudText(n.cloud)}</span>` : ''}
  </li>`;
}
