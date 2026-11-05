// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDb, ctxFor, sleep, until } from './helpers/dom';
import type { SetMeta } from '../src/sat/store';

vi.mock('../src/sat/client', () => ({
  SatWorker: class {
    loaded: string | null = null;
    call() {
      return Promise.reject(new Error('no worker in tests'));
    }
  },
}));

const { SatView } = await import('../src/ui/sat-view');
const store = await import('../src/sat/store');
const { todayKST } = await import('../src/time');

// (happy-dom replaces the global URL, so build the fixture path from a string.)
const TEXT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/celestrak-active-sample-2026-11-04.json'), 'utf8');
const meta = (id: string, downloadedAt: number): SetMeta => ({
  id,
  source: 'file',
  label: `${id}.json`,
  downloadedAt,
  format: 'omm-json',
  bytes: TEXT.length,
  loaded: 17,
  failed: 0,
  sixDigit: 5,
  epochMin: null,
  epochMax: null,
  failures: [],
});

beforeEach(async () => {
  await clearDb();
  document.body.innerHTML = '';
});

describe('Satellites tab: night lock written by the Log tab', () => {
  it('picks up the new lock on the next render and does not overwrite it when predicting', async () => {
    const tonight = todayKST();
    await store.putSet(meta('older', Date.now() - 86_400_000), TEXT);
    await store.putSet(meta('newest', Date.now()), TEXT);
    const ctx = ctxFor(tonight);
    const el = document.createElement('div');
    document.body.append(el);
    const view = new SatView(() => ctx);
    view.render(el);
    await until(() => el.textContent?.includes(`Not locked for ${tonight}`), 3000, 'unlocked Satellites tab');
    (view as any).selectedId = 'older'; // the user picked a set other than the newest

    // Log tab: "Lock the most recent element set for this night" (store-level, as LogView does).
    view.detach();
    await store.lockNightSet(tonight, 'newest');
    view.render(el); // back to the Satellites tab, same date
    await until(() => el.textContent?.includes(`${tonight} is locked`), 3000, 'lock shown in the Satellites tab');

    await (view as any).predict(); // the worker is a stub that fails after the lock step
    await sleep(50);
    const lock = await store.getNightSet(tonight);
    expect(lock?.setId).toBe('newest');
    expect(lock?.history).toEqual([]);
  });

  it('predicting does not re-lock a night that was locked elsewhere since the last render', async () => {
    const tonight = todayKST();
    await store.putSet(meta('older', Date.now() - 86_400_000), TEXT);
    await store.putSet(meta('newest', Date.now()), TEXT);
    const ctx = ctxFor(tonight);
    const el = document.createElement('div');
    document.body.append(el);
    const view = new SatView(() => ctx);
    view.render(el);
    await until(() => el.textContent?.includes(`Not locked for ${tonight}`), 3000, 'unlocked Satellites tab');
    (view as any).selectedId = 'older';
    await store.lockNightSet(tonight, 'newest'); // no re-render in between
    await (view as any).predict();
    const lock = await store.getNightSet(tonight);
    expect(lock?.setId).toBe('newest');
    expect(lock?.history).toEqual([]);
  });
});
