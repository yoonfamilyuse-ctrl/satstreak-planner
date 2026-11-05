import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Resolve with the promise's outcome, or 'hung' if it neither resolves nor rejects within `ms`. */
const settle = <T>(p: Promise<T>, ms = 1000) =>
  Promise.race([
    p.then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e })),
    new Promise<'hung'>((r) => setTimeout(() => r('hung'), ms)),
  ]);

function openRaw(version: number, stores: string[] = []) {
  return new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('satstreak', version);
    r.onupgradeneeded = () => stores.forEach((s) => r.result.objectStoreNames.contains(s) || r.result.createObjectStore(s, { keyPath: 'id' }));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function freshStore() {
  vi.resetModules();
  return import('../src/sat/store');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory(); // each test starts with no database
});

describe('IndexedDB version upgrade', () => {
  it('reports a tab still running the old version instead of hanging', async () => {
    const oldTab = await openRaw(1, ['sets', 'setData']); // v1 build: never closes on versionchange
    const store = await freshStore();
    const r = await settle(store.listLogs());
    expect(r).not.toBe('hung');
    expect(r !== 'hung' && !r.ok && r.e.message).toMatch(/another tab/i);

    oldTab.close(); // the user closes the old tab; the next call opens normally
    const again = await settle(store.listLogs());
    expect(again).toEqual({ ok: true, v: [] });
  });

  it('closes its connection when a newer version of the app opens the database', async () => {
    const store = await freshStore();
    await store.listLogs(); // this tab holds a v2 connection
    const newer = await settle(openRaw(3));
    expect(newer).not.toBe('hung');
    if (newer !== 'hung' && newer.ok) newer.v.close();
  });
});
