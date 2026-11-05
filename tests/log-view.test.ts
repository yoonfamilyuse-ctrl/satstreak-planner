// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDb, ctxFor, fire, sleep, typeInto, until } from './helpers/dom';

vi.mock('../src/sat/client', () => ({
  SatWorker: class {
    loaded: string | null = null;
    call() {
      return Promise.reject(new Error('no worker in tests'));
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
afterEach(() => vi.restoreAllMocks());

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
