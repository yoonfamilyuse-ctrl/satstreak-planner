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
