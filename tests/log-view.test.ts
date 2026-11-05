// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDb, ctxFor, fire, sleep, typeInto, until } from './helpers/dom';

/** Test worker: rejects by default; a test can set `worker.impl` to answer requests. */
const worker = vi.hoisted(() => ({ impl: null as null | ((req: any) => any) }));
vi.mock('../src/sat/client', () => ({
  SatWorker: class {
    loaded: string | null = null;
    call(req: any) {
      return worker.impl ? Promise.resolve(worker.impl(req)) : Promise.reject(new Error('no worker in tests'));
    }
  },
}));

const { LogView } = await import('../src/ui/log-view');
const store = await import('../src/sat/store');

const DATE = '2026-11-11';

function mount(date = DATE) {
  const ctx = ctxFor(date);
  const el = document.createElement('div');
  document.body.append(el);
  const view = new LogView(() => ctx);
  view.render(el);
  return { view, el, ctx, setDate(d: string) {
    Object.assign(ctx, ctxFor(d));
    view.render(el);
  } };
}

const q = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T>(sel);
const btn = (el: Element, act: string) => until(() => q(el, `[data-log="${act}"]`), 3000, `button ${act}`);

async function newLog(el: HTMLElement) {
  fire(await btn(el, 'new'), 'click');
  await until(() => q(el, '[data-f="observers"]'), 3000, 'log form');
}

beforeEach(async () => {
  await clearDb();
  document.body.innerHTML = '';
  // happy-dom has no geolocation; by default the position request never answers.
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn() } });
});
afterEach(() => {
  worker.impl = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Log tab: night date field', () => {
  it('ignores a cleared date instead of saving it, and the list still renders', async () => {
    const { el } = mount();
    await newLog(el);
    typeInto(q<HTMLInputElement>(el, '[data-f="date"]')!, '');
    await sleep(700); // past the 500-ms save debounce
    const [saved] = await store.listLogs();
    expect(saved.date).toBe(DATE);
    fire(await btn(el, 'back'), 'click');
    await until(() => el.textContent?.includes('Past logs (1)'), 3000, 'log list');
  });

  it('renders the list even when a stored log has a malformed date', async () => {
    const { newLog: make } = await import('../src/log/fieldlog');
    await store.putLog({ ...make(DATE), id: 'bad', date: '' });
    const { el } = mount();
    await until(() => el.textContent?.includes('Past logs (1)'), 3000, 'log list');
  });
});

/** Geolocation stub that holds each request so the test decides when (and whether) the fix arrives. */
function holdGps() {
  const calls: ((p: GeolocationPosition) => void)[] = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok: (p: GeolocationPosition) => void) => calls.push(ok) },
  });
  const fix = (i: number) =>
    calls[i]!({ coords: { latitude: 37.123456, longitude: 127.654321, altitude: 250, accuracy: 8 } } as GeolocationPosition);
  return { calls, fix };
}

describe('Log tab: saving the log that was edited', () => {
  it('keeps an edit made just before tapping "All logs"', async () => {
    const { el } = mount();
    await newLog(el);
    typeInto(q<HTMLInputElement>(el, '[data-f="observers"]')!, 'J. Park');
    fire(q(el, '[data-log="back"]')!, 'click'); // well within the 500-ms debounce
    await sleep(700);
    const [saved] = await store.listLogs();
    expect(saved.observers).toBe('J. Park');
    await until(() => el.textContent?.includes('J. Park'), 3000, 'list showing the edit');
  });

  it('saves a GPS fix that arrives after the user left the log', async () => {
    const gps = holdGps();
    const { el } = mount();
    await newLog(el);
    fire(q(el, '[data-log="back"]')!, 'click');
    await until(() => el.textContent?.includes('Past logs (1)'), 3000, 'log list');
    gps.fix(0);
    await sleep(100);
    const [saved] = await store.listLogs();
    expect(saved.site).toMatchObject({ latitude: 37.123456, longitude: 127.654321, elevation: 250, accuracyM: 8, source: 'gps' });
  });

  it('writes a late GPS fix to its own log, not to the log open now', async () => {
    const gps = holdGps();
    const { el } = mount();
    await newLog(el);
    const firstId = (await store.listLogs())[0].id;
    fire(q(el, '[data-log="back"]')!, 'click');
    await sleep(5); // distinct createdAt → distinct id
    await newLog(el);
    expect(await store.listLogs()).toHaveLength(2);
    gps.fix(0); // the first log's request answers while the second log is open
    await sleep(100);
    const logs = await store.listLogs();
    const first = logs.find((l) => l.id === firstId)!;
    const second = logs.find((l) => l.id !== firstId)!;
    expect(first.site.source).toBe('gps');
    expect(second.site.source).toBe('manual');
    expect(q<HTMLInputElement>(el, '[data-f="site.latitude"]')!.value).not.toBe('37.123456');
  });
});

describe('Log tab: delete', () => {
  it('a pending save does not bring a deleted log back', async () => {
    const { el } = mount();
    await newLog(el);
    typeInto(q<HTMLInputElement>(el, '[data-f="observers"]')!, 'J. Park');
    // The user reads the confirm dialog for longer than the save debounce; confirm() blocks the page meanwhile.
    vi.stubGlobal('confirm', () => {
      const t = Date.now() + 600;
      while (Date.now() < t) {
        /* dialog open */
      }
      return true;
    });
    fire(q(el, '[data-log="delete"]')!, 'click');
    await sleep(800);
    expect(await store.listLogs()).toEqual([]);
    await until(() => el.textContent?.includes('Past logs (0)'), 3000, 'empty list');
  });
});

/** Parse a header + one-row CSV (RFC 4180 quoting) into an object. */
function csvRow(csv: string): Record<string, string> {
  const text = csv
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n') row.push(cell), rows.push(row), (row = []), (cell = '');
    else cell += c;
  }
  const [head, vals] = rows;
  return Object.fromEntries(head.map((h, i) => [h, vals[i]]));
}

/** Capture files the view hands to the browser for download. */
function captureDownloads() {
  const files: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (files.push(b as Blob), 'blob:test'));
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return files;
}

describe('Log tab: export uses the log’s own night', () => {
  it('derives band frames and Sun times from log.date even when the selector shows another night', async () => {
    const { formatKst, bandFrames, parseKst } = await import('../src/log/fieldlog');
    const files = captureDownloads();
    const own = ctxFor(DATE).plan;
    const { el, setDate } = mount(DATE);
    await newLog(el);
    const start = formatKst(own.window!.start.getTime());
    typeInto(q<HTMLInputElement>(el, '[data-f="start"]')!, start);
    fire(q(el, '[data-log="back"]')!, 'click');
    await until(() => q(el, '[data-log="open"]'), 3000, 'log list');

    setDate('2026-11-20'); // the user browses to another night, then opens the older log
    fire(q(el, '[data-log="open"]')!, 'click');
    await until(() => q(el, '[data-f="observers"]'), 3000, 'log form');
    fire(q(el, '[data-log="csv"]')!, 'click');
    await until(() => files.length, 3000, 'CSV download');

    const row = csvRow(await files[0].text());
    expect(row.date).toBe(DATE);
    expect(row.sun_minus12_kst).toBe(formatKst(own.sun.descending[-12]!.getTime()));
    expect(row.sun_minus35_kst).toBe(formatKst(own.sun.descending[-35]!.getTime()));
    const t0 = parseKst(start)!; // whole seconds, as entered
    const expected = bandFrames(t0, 16, 15, own.window!.shots, own.bands);
    expect(row.twilight_first_frame).toBe(String(expected[0].firstFrame));
    expect(row.dark_last_frame).toBe(String(expected[1].lastFrame));
    expect(row.start_offset_from_plan_s).toBe(String(+((t0 - own.window!.start.getTime()) / 1000).toFixed(1)));
  });
});

describe('Log tab: "Now" fills a phone-clock time', () => {
  it('marks the field as phone time and does not apply the camera-clock offset to it', async () => {
    const { parseKst } = await import('../src/log/fieldlog');
    const { fmtHMS } = await import('../src/time');
    const { el } = mount();
    await newLog(el);
    // Camera 30 s fast (one time.is reading).
    typeInto(q<HTMLInputElement>(el, '[data-f="clockBefore.0.exif"]')!, '2026-11-11T18:00:30');
    typeInto(q<HTMLInputElement>(el, '[data-f="clockBefore.0.actual"]')!, '2026-11-11T18:00:00');
    fire(q(el, '[data-log="now"][data-target="start"]')!, 'click');
    await sleep(700);

    const [saved] = await store.listLogs();
    expect(saved.timeSource).toMatchObject({ start: 'phone', end: 'camera' });
    // The source is shown next to the value.
    // (happy-dom misreports select.value for markup-selected options, so read the selected option.)
    const shown = (f: string) => q<HTMLOptionElement>(el, `[data-f="${f}"] option[selected]`)?.value ?? 'camera';
    expect(shown('timeSource.start')).toBe('phone');
    expect(shown('timeSource.end')).toBe('camera');
    // True start = the phone time as filled, not shifted by −30 s.
    const derived = q(el, '#log-derived')!.textContent!;
    expect(derived).toContain(fmtHMS(new Date(parseKst(saved.start)!)));
    expect(derived).not.toContain('(corrected)');
  });
});

describe('Log tab: frame → band converter', () => {
  it('evaluates the Sun at mid-exposure of the logged exposure time', async () => {
    const { formatKst, frameStart, parseKst } = await import('../src/log/fieldlog');
    const { sunAltitude } = await import('../src/astro/sun');
    const { DEFAULT_SITE } = await import('../src/config');
    const { el, ctx } = mount();
    await newLog(el);
    const start = formatKst(ctx.plan.window!.start.getTime());
    typeInto(q<HTMLInputElement>(el, '[data-f="start"]')!, start);
    typeInto(q<HTMLInputElement>(el, '[data-f="camera.exposureS"]')!, '30');
    typeInto(q<HTMLInputElement>(el, '[data-f="camera.intervalS"]')!, '31');
    typeInto(q<HTMLInputElement>(el, '#conv-frame')!, '40');
    const text = q(el, '#log-conv')!.textContent!;
    const fs = frameStart(parseKst(start)!, 31, 40);
    const mid = sunAltitude(new Date(fs + 15_000), DEFAULT_SITE).toFixed(2);
    const wrong = sunAltitude(new Date(fs + 7_500), DEFAULT_SITE).toFixed(2);
    expect(mid).not.toBe(wrong); // the test can tell the two apart
    expect(text).toContain(`Sun ${mid}° at mid-exposure`);
  });
});

describe('Log tab: mid-exposure band rule', () => {
  it('an on-plan start shows identical Actual and Planned band frames', async () => {
    const { formatKst } = await import('../src/log/fieldlog');
    const { el, ctx } = mount();
    await newLog(el);
    typeInto(q<HTMLInputElement>(el, '[data-f="start"]')!, formatKst(ctx.plan.window!.start.getTime()));
    const rows = [...el.querySelectorAll('#log-derived tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim()));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r[2], r[0]).toBe(r[3]);
    expect(rows[0][2]).toBe('20–172');
  });

  it('the EXIF converter classifies a photo by its mid-exposure', async () => {
    const { formatKst } = await import('../src/log/fieldlog');
    const { el, ctx } = mount();
    await newLog(el);
    typeInto(q<HTMLInputElement>(el, '[data-f="start"]')!, formatKst(ctx.plan.window!.start.getTime()));
    // EXIF time 5 s before the Sun reaches −12°: the moment is outside, but mid-exposure (+7.5 s) is in twilight.
    typeInto(q<HTMLInputElement>(el, '#conv-exif')!, formatKst(ctx.plan.sun.descending[-12]!.getTime() - 5000));
    expect(q(el, '#log-conv')!.textContent).toContain('at mid-exposure · Twilight band');
  });

  it('the ISS check gives each frame its band by mid-exposure, for both EXIF conventions', async () => {
    const { formatKst } = await import('../src/log/fieldlog');
    const TEXT = '[]';
    await store.putSet({ id: 'set1', source: 'file', label: 'set1.json', downloadedAt: Date.now(), format: 'omm-json', bytes: 2, loaded: 0, failed: 0, sixDigit: 0, epochMin: null, epochMax: null, failures: [] }, TEXT);
    await store.lockNightSet(DATE, 'set1');
    // The ISS is in the frame (S, 60°) and sunlit at every requested time.
    worker.impl = (req) => (req.type === 'track' ? { epoch: 0, points: req.times.map((t: number) => ({ t, az: 180, alt: 60, sunlit: true })) } : {});
    const { el, ctx } = mount();
    await newLog(el);
    await until(() => !q(el, '[data-log="lock-latest"]'), 3000, 'element set picked up from the night lock');
    const t12 = ctx.plan.sun.descending[-12]!.getTime();
    typeInto(q<HTMLInputElement>(el, '[data-f="start"]')!, formatKst(t12 - 20_000)); // ≈ 20.3 s before −12°
    typeInto(q<HTMLInputElement>(el, '[data-f="camera.azimuth"]')!, '180');
    typeInto(q<HTMLInputElement>(el, '[data-f="camera.altitude"]')!, '60');
    typeInto(q<HTMLInputElement>(el, '[data-f="camera.shotsTaken"]')!, '3');
    fire(q(el, '[data-log="iss-check"]')!, 'click');
    await until(() => q(el, '#log-iss tbody'), 3000, 'ISS table');
    const rows = [...el.querySelectorAll('#log-iss tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent!.trim()).join(' '));
    // A: frame n mid = T0 + (n−1)·16 + 7.5 s → −12.8, +3.2, +19.2 s from −12°. B: 15 s earlier.
    expect(rows).toEqual([
      'A 1 Outside bands',
      'A 2 Twilight band',
      'A 3 Twilight band',
      'B 1 Outside bands',
      'B 2 Outside bands',
      'B 3 Twilight band',
    ]);
  });
});
