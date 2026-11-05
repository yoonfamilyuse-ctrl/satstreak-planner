import { CRITERIA, type OutlookNight, type Rating } from '../outlook';
import { fmtHM, fmtShortDate } from '../time';
import { cloudText, esc, moonIcon, OPEN_METEO_ATTRIBUTION } from './util';

export type ForecastStatus =
  | { state: 'loading' }
  | { state: 'ok'; fetchedAt: number }
  | { state: 'error'; message: string; fetchedAt?: number };

const RATING_LABEL: Record<Rating, string> = { good: 'Good', fair: 'Fair', poor: 'Poor', none: 'No window' };

export function renderOutlook(nights: OutlookNight[], fs: ForecastStatus): string {
  const status =
    fs.state === 'loading'
      ? 'Loading cloud forecast from Open-Meteo…'
      : fs.state === 'ok'
        ? `Cloud forecast fetched ${fmtHM(new Date(fs.fetchedAt))} KST. ${OPEN_METEO_ATTRIBUTION} (CC BY 4.0).`
        : `Cloud forecast unavailable (${esc(fs.message)}). Moon data is still valid.`;
  const goodCount = nights.filter((n) => n.rating === 'good').length;
  const head = `<section class="card">
    <h2>Next 14 nights</h2>
    <p class="fc-status">${status} <button type="button" id="fc-refresh" class="small"${fs.state === 'loading' ? ' disabled' : ''}>Refresh</button></p>
    <p class="note">${goodCount ? `<b>${goodCount}</b> good night${goodCount > 1 ? 's' : ''} highlighted.` : 'No night meets the “good” criteria yet.'} Tap a night for its full schedule.</p>
    <details class="criteria"><summary>How nights are rated</summary>
      <ul>
        <li><b>Moon index</b> = illuminated % × fraction of the window the Moon is above the horizon (0 = no Moon, 100 = full Moon all window). ≤ ${CRITERIA.moonNoneMax}: no Moon; ≤ ${CRITERIA.moonLowMax}: low; above: bright.</li>
        <li><b>Cloud</b> = mean total cloud cover over the window (hourly forecast, linearly interpolated, sampled every 10 min). ≤ ${CRITERIA.cloudClearMax}%: clear; ≤ ${CRITERIA.cloudPartlyMax}%: partly; above: cloudy.</li>
        <li><b>Good</b> = no/low Moon and clear. <b>Fair</b> = no/low Moon with partly cloudy or no forecast, or clear with a bright Moon. <b>Poor</b> = the rest.</li>
        <li>Forecasts several days ahead are unreliable; recheck the day before.</li>
      </ul>
    </details>
  </section>`;
  return head + `<div class="nights">${nights.map((n, i) => card(n, i)).join('')}</div>`;
}

function card(n: OutlookNight, i: number): string {
  const p = n.plan;
  const w = p.window;
  const d = p.dateStr;
  const label = i === 0 ? `Tonight · ${fmtShortDate(d)}` : fmtShortDate(d);
  const winMin = w ? Math.round(w.durationMs / 60000) : 0;
  const moonUp = w ? (p.moon.minutesUp === 0 ? 'not up' : p.moon.minutesUp >= winMin ? `up all ${winMin} min` : `up ${p.moon.minutesUp} of ${winMin} min`) : '—';
  return `<article class="night-card r-${n.rating}">
    <div class="nc-head"><a class="nc-date stretched" href="#${d}">${label}</a><span class="badge r-${n.rating}">${RATING_LABEL[n.rating]}</span></div>
    <div class="nc-row tnum">${w ? `${fmtHM(w.start, d)}–${fmtHM(w.end, d)} · ${w.shots} shots` : 'Sun does not reach −35°'}</div>
    <div class="nc-row tnum"><span class="nc-ico">${moonIcon(p.moon.illuminationPct, p.moon.waxing, 18)}</span>Moon ${p.moon.illuminationPct.toFixed(0)}% · ${moonUp}${n.moonIndex !== null ? ` <span class="sec">(index ${n.moonIndex.toFixed(0)})</span>` : ''}</div>
    <div class="nc-row tnum c-${n.cloudClass}"><span class="nc-ico">☁︎</span>${cloudText(n.cloud)} · ${OPEN_METEO_ATTRIBUTION}</div>
  </article>`;
}
