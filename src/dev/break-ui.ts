/**
 * DEV ONLY: "break-ui" data switch. A Vite plugin with apply: 'serve' (vite.config.ts) adds it to the page on the
 * dev server; `vite build` never sees it (checked by tests/dev-only.test.ts).
 *
 * Each state writes realistic worst-case data through the app's own storage (saved site in localStorage, logs and
 * element sets in IndexedDB) and reloads, so the UI is tested exactly as with real data. It replaces the data of
 * this origin (the dev server), never the deployed site's.
 */
import fixture from '../../tests/fixtures/celestrak-active-sample-2026-11-04.json?raw';
import { newLog, type FieldLog } from '../log/fieldlog';
import { lockNightSet, putLog, putSet, type SetMeta } from '../sat/store';

type State = 'demo' | 'worst' | 'empty' | 'many' | 'summer';
const STATES: [State, string][] = [
  ['demo', 'Demo'],
  ['worst', 'Worst case'],
  ['empty', 'Empty'],
  ['many', '40 logs'],
  ['summer', 'Summer'],
];
const PENDING = 'dev.breakui.pending';
const LS_KEYS = ['satstreak.site', 'satstreak.camera', 'satstreak.magnitude', 'satstreak.forecast', 'satstreak.darkSpans', 'satstreak.nightOverride'];

// Realistic worst cases (not random strings).
const LONG_SITE = { name: 'Hoengseong-gun, Gangwon State: Hoengseong High School sports field (behind the gym, east gate)', latitude: 37.48, longitude: 128.16, elevation: 300 };
// Longest OBJECT_NAMEs in the 2026-11-05 CelesTrak active catalogue.
const LONG_NAMES = ['DB GME UT (DB-GLOBE MISSION EARTH-UT)', 'ION SCV-019 (ASTOUNDING ALEXANDRA)', 'NUSAT-49 (KLARA DAN VON NEUMANN)', 'CENTISPACE-1 GROUP 05 OBJECT A', 'QPS-SAR-20 (WADATSUMI-II)'];

function logs(n: number): FieldLog[] {
  const out: FieldLog[] = [];
  const t0 = Date.UTC(2026, 10, 11, 9, 14);
  for (let i = 0; i < n; i++) {
    const day = 11 - (i % 30);
    const date = `2026-${day > 0 ? '11' : '10'}-${String(day > 0 ? day : 31 + day).padStart(2, '0')}`;
    const l = newLog(date, t0 - i * 86_400_000 + i);
    const k = i % 4;
    if (k === 0) {
      l.observers = 'Sungjun Yoon, Rocky Kim (김락희), Aleksandra Wiśniewska-Kowalczyk';
      l.notes =
        'Airplane through the frame at 18:52 (frames ~145–149) and again 19:31. Car headlights from the access road lit the foreground twice. Dew on the lens hood after 20:00; wiped at 20:04, about 3 frames may be soft. Battery swap NOT needed. Rocky timed the ISS by eye: entered upper left ~18:48:20. https://time.is/Seoul photo set is DSC09812–DSC09821.';
      l.weather = 'Wind 2–3 m/s from the north-west, humidity 78 % rising to 91 %, dew point 1 °C, air 3 °C → −1 °C, light frost on the grass by 20:30';
      l.moon = '4% lit (Waxing crescent); below the horizon for the whole window (predicted)';
      l.clouds = 'Thin high cloud';
      l.start = '2026-11-11T18:14:02';
      l.end = '2026-11-11T20:20:41';
      l.camera.shotsTaken = 476;
      l.clockBefore = [
        { exif: '2026-11-11T18:11:58', actual: '2026-11-11T18:11:57' },
        { exif: '2026-11-11T18:12:03', actual: '2026-11-11T18:12:02' },
        { exif: '2026-11-11T18:12:09', actual: '2026-11-11T18:12:07' },
      ];
    } else if (k === 1) {
      l.observers = 'J';
      l.camera.shotsTaken = 1;
      l.start = `${date}T18:20:00`;
    } else if (k === 2) {
      l.observers = '';
    } else {
      l.observers = '윤성준, 김락희';
      l.clouds = 'Partly cloudy';
      l.start = `${date}T18:13:30`;
      l.camera.shotsTaken = 1203;
    }
    out.push(l);
  }
  return out;
}

async function seed(state: State) {
  if (state === 'demo' || state === 'empty') return;
  if (state === 'many') {
    for (const l of logs(40)) await putLog(l);
    return;
  }
  // worst / summer
  for (const l of logs(4)) await putLog(l);
  const omm = JSON.parse(fixture) as { OBJECT_NAME: string; NORAD_CAT_ID: number }[];
  let j = 0;
  for (const o of omm) if (o.NORAD_CAT_ID !== 25544 && j < LONG_NAMES.length) o.OBJECT_NAME = LONG_NAMES[j++];
  const text = JSON.stringify(omm);
  const downloadedAt = Date.now() - 3 * 3600e3;
  const meta: SetMeta = {
    id: `file-${new Date(downloadedAt).toISOString()}`,
    source: 'file',
    label: 'celestrak-active-sample-2026-11-04 (long names) — a file name long enough to wrap twice on a phone.json',
    downloadedAt,
    format: 'omm-json',
    bytes: text.length,
    loaded: omm.length,
    failed: 3,
    sixDigit: 0,
    epochMin: downloadedAt - 2 * 86_400_000,
    epochMax: downloadedAt,
    failures: [
      { id: 'COSMOS 2251 DEB (34427)', reason: 'SGP4 initialisation failed (eccentricity ≥ 1)' },
      { id: 'line 1204', reason: 'MEAN_MOTION missing' },
      { id: 'OBJECT 99999', reason: 'epoch in the future' },
    ],
  };
  await putSet(meta, text);
  await lockNightSet('2026-11-11', meta.id);
}

function choose(state: State) {
  try {
    for (const k of LS_KEYS) localStorage.removeItem(k);
    if (state !== 'demo' && state !== 'empty') localStorage.setItem('satstreak.site', JSON.stringify(LONG_SITE));
    sessionStorage.setItem(PENDING, state);
  } catch {
    /* ignore */
  }
  const url = new URL(location.href);
  url.searchParams.set('data', state);
  if (state === 'summer') url.hash = '2026-06-21';
  const del = indexedDB.deleteDatabase('satstreak');
  const go = () => location.replace(url.toString());
  del.onsuccess = go;
  del.onerror = go;
  del.onblocked = go;
}

export async function mountBreakUi() {
  const pending = sessionStorage.getItem(PENDING) as State | null;
  if (pending) {
    sessionStorage.removeItem(PENDING);
    await seed(pending);
    location.reload();
    return;
  }
  const current = (new URL(location.href).searchParams.get('data') as State) ?? 'demo';
  const bar = document.createElement('div');
  bar.id = 'dev-break-ui';
  bar.setAttribute('style', 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 12px);transform:translateX(-50%);z-index:9999;display:flex;gap:2px;padding:3px;border-radius:10px;background:#ddd;font:12px -apple-system,system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.2)');
  for (const [s, label] of STATES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('style', `all:unset;cursor:pointer;padding:7px 9px;border-radius:8px;color:#111;${s === current ? 'background:#fff' : ''}`);
    b.addEventListener('click', () => choose(s));
    bar.append(b);
  }
  document.body.append(bar);
}
