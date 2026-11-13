import './style.css';
import { DEFAULT_SITE, type Site } from './config';
import { computeNight } from './astro/schedule';
import { nextShootableNight, outlook } from './outlook';
import { loadSite, resetSite, saveSite, validateSite } from './site';
import { addDays, isValidDateString, todayKST } from './time';
import { getLang, longDate, S, setLang, shortDate } from './i18n';
import { cachedForecast, cloudAverage, fetchForecast, type CloudForecast } from './weather/openmeteo';
import { NightView } from './ui/night-view';
import { renderOutlook, type ForecastStatus } from './ui/outlook-view';
import { SatView } from './ui/sat-view';
import { LogView } from './ui/log-view';
import { AUTO_NIGHT_ALT, currentDecision, refreshSpans, userSetNight, type ThemeDecision } from './autonight';

const CHEVRON_LEFT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
type View = 'night' | 'outlook' | 'sats' | 'log';

const state: { view: View; date: string; site: Site; fc: CloudForecast | null; fs: ForecastStatus } = {
  view: 'night',
  date: todayKST(),
  site: loadSite(),
  fc: null,
  fs: { state: 'loading' },
};

// ---------- shell ----------

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <h1>Sat-Streak Planner</h1>
    <div class="topbar-actions">
      <button id="lang-toggle" type="button" class="lang-btn"></button>
      <button id="night-toggle" type="button" aria-pressed="false"></button>
    </div>
  </header>
  <div class="autonight" id="autonight" hidden>
    <span id="autonight-text"></span>
    <button type="button" id="day-mode" class="text-btn" data-t="dayMode"></button>
  </div>
  <nav class="tabs" role="tablist">
    <button type="button" role="tab" data-view="night" data-t="tabs.night"></button>
    <button type="button" role="tab" data-view="outlook" data-t="tabs.outlook"></button>
    <button type="button" role="tab" data-view="sats" data-t="tabs.sats"></button>
    <button type="button" role="tab" data-view="log" data-t="tabs.log"></button>
  </nav>
  <main>
    <section class="datebar">
      <div id="date-block">
        <div class="date-row">
          <button type="button" class="icon-btn" data-day="-1" data-t-aria="prevNight">${CHEVRON_LEFT}</button>
          <label class="date-pick">
            <span class="date-main" id="date-label"></span>
            <span class="date-sub"><span data-t="dateSub"></span><span class="tap-hint" data-t="tapHint"></span></span>
            <input id="date" type="date" data-t-aria="dateAria" />
          </label>
          <button type="button" class="icon-btn" data-day="1" data-t-aria="nextNight">${CHEVRON_RIGHT}</button>
          <button type="button" id="today" class="pill-btn" data-t="tonight"></button>
        </div>
        <div class="find-row">
          <button type="button" id="find-next" class="pill-btn" data-t="findNext"></button>
          <p class="msg" id="find-msg" role="status" aria-live="polite"></p>
        </div>
      </div>
      <details class="site">
        <summary><span data-t="site"></span> <b id="site-summary"></b></summary>
        <form class="site-form" id="site-form" novalidate>
          <label class="full"><span data-t="siteName"></span> <input name="name" autocomplete="off" /></label>
          <label><span data-t="lat"></span> <input name="latitude" inputmode="decimal" /></label>
          <label><span data-t="lon"></span> <input name="longitude" inputmode="decimal" /></label>
          <label><span data-t="elev"></span> <input name="elevation" inputmode="decimal" /></label>
          <span></span>
          <div class="actions">
            <button class="primary" type="submit" data-t="saveSite"></button>
            <button type="button" id="gps" data-t="gps"></button>
            <button type="button" id="reset-site" data-t="reset"></button>
          </div>
        </form>
        <p class="msg" id="site-msg"></p>
      </details>
    </section>
    <div id="results"></div>
  </main>
  <footer id="footer"></footer>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const dateInput = $<HTMLInputElement>('#date');
const siteForm = $<HTMLFormElement>('#site-form');
const siteMsg = $('#site-msg');
const results = $('#results');
const nightBtn = $<HTMLButtonElement>('#night-toggle');

// ---------- language ----------

/** Put the current language's strings into the shell (top bar, tabs, date row, site form, footer). */
function paintShell() {
  const L = S().shell as Record<string, any>;
  const get = (path: string): string => path.split('.').reduce<any>((o, k) => o?.[k], L);
  app.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.textContent = get(el.dataset.t!)));
  app.querySelectorAll<HTMLElement>('[data-t-aria]').forEach((el) => el.setAttribute('aria-label', get(el.dataset.tAria!)));
  $('#autonight-text').textContent = S().shell.autoNight(AUTO_NIGHT_ALT);
  $('#footer').innerHTML = S().shell.footer;
  const lb = $<HTMLButtonElement>('#lang-toggle');
  lb.textContent = S().shell.langBtn;
  lb.setAttribute('aria-label', S().shell.langAria);
  lb.lang = getLang() === 'ko' ? 'en' : 'ko';
  document.documentElement.lang = getLang();
}
paintShell();
$('#lang-toggle').addEventListener('click', () => {
  setLang(getLang() === 'ko' ? 'en' : 'ko');
  paintShell();
  applyTheme();
  siteMsg.textContent = '';
  $('#find-msg').textContent = '';
  render();
});

// ---------- night mode ----------

// Night mode is on when the user switched it on, or automatically while the Sun is below −6° at the saved site
// (unless the user chose day mode for that night). See autonight.ts; the same rule runs before first paint in
// index.html.
function applyTheme(dec: ThemeDecision = currentDecision()) {
  const root = document.documentElement;
  const on = dec !== 'day';
  if (on) root.dataset.theme = 'night';
  else delete root.dataset.theme;
  if (dec === 'auto-night') root.dataset.auto = '1';
  else delete root.dataset.auto;
  $('#autonight').hidden = dec !== 'auto-night';
  nightBtn.setAttribute('aria-pressed', String(on));
  nightBtn.textContent = on ? S().shell.nightOn : S().shell.night;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#000000' : '#e9e7e2');
}
nightBtn.addEventListener('click', () => {
  userSetNight(document.documentElement.dataset.theme !== 'night');
  applyTheme();
});
$('#day-mode').addEventListener('click', () => {
  userSetNight(false);
  applyTheme();
});
refreshSpans(state.site);
applyTheme();
// iOS Safari often resumes a tab without reloading it: check again when the app comes back and every minute.
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && applyTheme());
setInterval(() => applyTheme(), 60_000);

// ---------- routing: #outlook, #YYYY-MM-DD (night plan), #sats/YYYY-MM-DD ----------

function applyHash() {
  const h = location.hash.slice(1);
  if (h === 'outlook') state.view = 'outlook';
  else if (h === 'sats' || h.startsWith('sats/') || h === 'log' || h.startsWith('log/')) {
    state.view = h.startsWith('log') ? 'log' : 'sats';
    const d = h.split('/')[1] ?? '';
    if (isValidDateString(d)) state.date = d;
  } else {
    state.view = 'night';
    if (isValidDateString(h)) state.date = h;
  }
  render();
  window.scrollTo(0, 0);
}

const dateHash = (d: string) => (state.view === 'sats' || state.view === 'log' ? `${state.view}/${d}` : d);
window.addEventListener('hashchange', applyHash);

function go(hash: string) {
  if (location.hash.slice(1) === hash) applyHash();
  else location.hash = hash;
}

app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => go(b.dataset.view === 'outlook' ? 'outlook' : b.dataset.view === 'sats' || b.dataset.view === 'log' ? `${b.dataset.view}/${state.date}` : state.date)),
);
const findMsg = $('#find-msg');
dateInput.addEventListener('change', () => {
  findMsg.textContent = '';
  if (isValidDateString(dateInput.value)) go(dateHash(dateInput.value));
});
app.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) =>
  b.addEventListener('click', () => {
    findMsg.textContent = '';
    go(dateHash(addDays(state.date, Number(b.dataset.day))));
  }),
);
$('#today').addEventListener('click', () => {
  findMsg.textContent = '';
  go(dateHash(todayKST()));
});

// Nearest night worth shooting, from tonight over the outlook's 14 nights (same ratings as the 14-night tab).
const FIND_DAYS = 14;
$('#find-next').addEventListener('click', () => {
  const T = S().shell;
  const nights = outlook(todayKST(), state.site, state.fc, FIND_DAYS);
  const hit = nextShootableNight(nights);
  const noFc = state.fc ? '' : ` ${T.findNoForecast}`;
  if (!hit) {
    findMsg.textContent = T.findNone(FIND_DAYS) + noFc;
    return;
  }
  const d = hit.plan.dateStr;
  findMsg.textContent = (hit.rating === 'good' ? T.findGood(shortDate(d)) : T.findFair(shortDate(d), FIND_DAYS)) + noFc;
  go(dateHash(d));
});

// ---------- site ----------

function fillSiteForm(s: Site) {
  const f = siteForm.elements as unknown as Record<string, HTMLInputElement>;
  f.name.value = s.name;
  f.latitude.value = String(s.latitude);
  f.longitude.value = String(s.longitude);
  f.elevation.value = String(s.elevation);
}

function setSite(s: Site) {
  state.site = s;
  refreshSpans(s);
  applyTheme();
  fillSiteForm(s);
  loadForecast();
}

siteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(siteForm);
  const s: Site = {
    name: String(fd.get('name') || '').trim() || S().shell.customSite,
    latitude: Number(fd.get('latitude')),
    longitude: Number(fd.get('longitude')),
    elevation: Number(fd.get('elevation')),
  };
  const err = validateSite(s);
  if (err) {
    siteMsg.textContent = S().shell.siteErr[err] ?? err;
    return;
  }
  saveSite(s);
  siteMsg.textContent = S().shell.saved;
  setSite(s);
});

$('#reset-site').addEventListener('click', () => {
  siteMsg.textContent = S().shell.resetTo(DEFAULT_SITE.name);
  setSite(resetSite());
});

$('#gps').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    siteMsg.textContent = S().shell.noGeo;
    return;
  }
  siteMsg.textContent = S().shell.gettingLoc;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const f = siteForm.elements as unknown as Record<string, HTMLInputElement>;
      f.latitude.value = pos.coords.latitude.toFixed(5);
      f.longitude.value = pos.coords.longitude.toFixed(5);
      if (pos.coords.altitude != null) f.elevation.value = pos.coords.altitude.toFixed(0);
      f.name.value = S().shell.gpsName;
      siteMsg.textContent = S().shell.gpsFilled(Math.round(pos.coords.accuracy));
    },
    (err) => (siteMsg.textContent = S().shell.gpsFailed(err.message)),
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

// ---------- cloud forecast ----------

let fcRequest = 0;
async function loadForecast(force = false) {
  const req = ++fcRequest;
  const cached = force ? null : cachedForecast(state.site);
  if (cached) {
    state.fc = cached;
    state.fs = { state: 'ok', fetchedAt: cached.fetchedAt };
    render();
    return;
  }
  state.fs = { state: 'loading' };
  render();
  try {
    const fc = await fetchForecast(state.site, { force: true });
    if (req !== fcRequest) return; // superseded (site changed)
    state.fc = fc;
    state.fs = { state: 'ok', fetchedAt: fc.fetchedAt };
  } catch (e) {
    if (req !== fcRequest) return;
    // Keep an older forecast for the same site if we have one in memory.
    const old = state.fc && Math.abs(state.fc.latitude - state.site.latitude) < 0.01 && Math.abs(state.fc.longitude - state.site.longitude) < 0.01 ? state.fc : null;
    state.fc = old;
    state.fs = { state: 'error', message: navigator.onLine === false ? 'offline' : String((e as Error).message ?? e), fetchedAt: old?.fetchedAt };
  }
  render();
}

// ---------- rendering ----------

function render() {
  app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  $('#date-block').hidden = state.view === 'outlook';
  $('#site-summary').textContent = `${state.site.name} · ${state.site.latitude.toFixed(4)}°, ${state.site.longitude.toFixed(4)}°, ${state.site.elevation} m`;

  if (state.view !== 'sats') satView.detach();
  if (state.view !== 'log') logView.detach();
  if (state.view !== 'night') nightView.detach();
  if (state.view === 'outlook') {
    results.innerHTML = renderOutlook(outlook(todayKST(), state.site, state.fc), state.fs);
    results.querySelector<HTMLButtonElement>('#fc-refresh')?.addEventListener('click', () => loadForecast(true));
    return;
  }

  dateInput.value = state.date;
  $('#date-label').textContent = longDate(state.date);
  const plan = computeNight(state.date, state.site);
  if (state.view === 'sats' || state.view === 'log') {
    satCtx = { date: state.date, site: state.site, plan };
    (state.view === 'sats' ? satView : logView).render(results);
    return;
  }
  // undefined → forecast not loaded (line hidden); null → loaded but date outside the forecast range.
  const cloud = state.fc && plan.window ? cloudAverage(state.fc, plan.window.start, plan.window.end) : state.fc ? null : undefined;
  nightView.render(results, plan, cloud);
}

let satCtx: { date: string; site: Site; plan: ReturnType<typeof computeNight> } | null = null;
const satView = new SatView(() => satCtx!);
const logView = new LogView(() => satCtx!);
const nightView = new NightView();

fillSiteForm(state.site);
applyHash();
loadForecast();
