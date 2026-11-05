import { CRITERIA, type OutlookNight, type Rating } from '../outlook';
import { fmtHM, fmtShortDate, kstNoon } from '../time';
import { cloudText, esc, moonIcon, openMeteoAttribution } from './util';

export type ForecastStatus =
  | { state: 'loading' }
  | { state: 'ok'; fetchedAt: number }
  | { state: 'error'; message: string; fetchedAt?: number };

const RATING_LABEL: Record<Rating, string> = { good: 'Good', fair: 'Fair', poor: 'Poor', none: 'No window' };
const WD = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', weekday: 'short' });
const DM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', day: 'numeric', month: 'short' });

/**
 * 14-night outlook as a proof sheet: one row per night on a shared evening time axis. Each row's film bar spans
 * the shooting window, with both solar bands marked in grease-pencil red and the Moon's time above the horizon
 * as an amber lane (from the plan's 10-min Moon samples). Good nights are circled. Display only: windows, bands,
 * Moon and cloud averages come from the night plans and outlook.ts.
 */
export function renderOutlook(nights: OutlookNight[], fs: ForecastStatus): string {
  const status =
    fs.state === 'loading'
      ? 'Loading cloud forecast from Open-Meteo…'
      : fs.state === 'ok'
        ? `Cloud forecast fetched ${fmtHM(new Date(fs.fetchedAt))} KST.`
        : `Cloud forecast unavailable (${esc(fs.message)}). Moon data is still valid.`;
  const goodCount = nights.filter((n) => n.rating === 'good').length;
  const axis = timeAxis(nights);
  const head = `<section class="block ol-head">
    <h2>Next 14 nights</h2>
    <p class="note">${goodCount ? `<b>${goodCount}</b> good night${goodCount > 1 ? 's' : ''}, circled.` : 'No night meets the “good” criteria yet.'} Tap a night for its schedule.</p>
    <div class="fc-status"><span>${status} ${openMeteoAttribution()} (CC BY 4.0)</span><button type="button" id="fc-refresh"${fs.state === 'loading' ? ' disabled' : ''}>Refresh</button></div>
  </section>`;
  const legend = `<div class="ol-legend" aria-hidden="true">
    <span><i class="lg-film"></i>shooting window</span><span><i class="lg-band"></i>twilight / dark band</span><span><i class="lg-moon"></i>Moon up</span>
  </div>
  ${axis ? `<div class="ol-axis tnum" aria-hidden="true">${axis.ticks.map((t) => `<span style="left:${t.pct}%">${t.label}</span>`).join('')}</div>` : ''}`;
  const criteria = `<details class="how"><summary>How nights are rated</summary>
      <ul class="note">
        <li><b>Moon index</b> = illuminated % × fraction of the window the Moon is above the horizon (0 = no Moon, 100 = full Moon all window). ≤ ${CRITERIA.moonNoneMax}: no Moon; ≤ ${CRITERIA.moonLowMax}: low; above: bright.</li>
        <li><b>Cloud</b> = mean total cloud cover over the window (hourly forecast, linearly interpolated, sampled every 10 min). ≤ ${CRITERIA.cloudClearMax}%: clear; ≤ ${CRITERIA.cloudPartlyMax}%: partly; above: cloudy.</li>
        <li><b>Good</b> = no/low Moon and clear. <b>Fair</b> = no/low Moon with partly cloudy or no forecast, or clear with a bright Moon. <b>Poor</b> = the rest.</li>
        <li>Forecasts several days ahead are unreliable; recheck the day before.</li>
      </ul>
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
  const noon = kstNoon(d);
  const winMin = w ? Math.round(w.durationMs / 60000) : 0;
  const moonUp = w ? (p.moon.minutesUp === 0 ? 'not up' : p.moon.minutesUp >= winMin ? `up all ${winMin} min` : `up ${p.moon.minutesUp} of ${winMin} min`) : '—';
  const pos = (t: Date) => (axis ? ((minAfterNoon(t, d) - axis.from) / (axis.to - axis.from)) * 100 : 0);
  let bar = '<div class="ol-bar"><span class="ol-none">Sun does not reach −35°</span></div>';
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
    <a class="ol-link" href="#${d}" aria-label="${esc(fmtShortDate(d))}: ${RATING_LABEL[n.rating]}">
      <span class="ol-date"><b>${i === 0 ? 'Tonight' : WD.format(noon)}</b><span class="tnum">${DM.format(noon)}</span></span>
      <span class="ol-mid">
        ${bar}
        <span class="ol-facts tnum">${w ? `${fmtHM(w.start, d)}–${fmtHM(w.end, d)} · ${w.shots} shots` : 'no window'}</span>
        <span class="ol-facts tnum"><span class="nc-ico">${moonIcon(p.moon.illuminationPct, p.moon.waxing, 16)}</span>Moon ${p.moon.illuminationPct.toFixed(0)}% · ${moonUp}${n.moonIndex !== null ? ` · index ${n.moonIndex.toFixed(0)}` : ''}</span>
      </span>
      <span class="ol-cloud c-${n.cloudClass}"><b class="tnum">${cloudBig}</b><span>cloud</span><span class="ol-rating">${RATING_LABEL[n.rating]}</span></span>
    </a>
    ${n.cloud ? `<span class="ol-cloud-detail tnum">${cloudText(n.cloud)}</span>` : ''}
  </li>`;
}
