/** Shared helpers for UI tests that run under happy-dom with fake-indexeddb. */
import { DEFAULT_SITE } from '../../src/config';
import { computeNight } from '../../src/astro/schedule';

export const sleep = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll until `fn` returns a truthy value (or throw after `timeout` ms). */
export async function until<T>(fn: () => T, timeout = 3000, what = 'condition'): Promise<NonNullable<T>> {
  const t0 = Date.now();
  for (;;) {
    let v: T | undefined;
    try {
      v = fn();
    } catch {
      v = undefined;
    }
    if (v) return v as NonNullable<T>;
    if (Date.now() - t0 > timeout) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
}

/** Remove every record from the app's IndexedDB database (keeps the schema). */
export async function clearDb() {
  const d = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('satstreak');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const names = [...d.objectStoreNames];
  if (names.length) {
    await new Promise<void>((res, rej) => {
      const t = d.transaction(names, 'readwrite');
      for (const n of names) t.objectStore(n).clear();
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  d.close();
}

export function ctxFor(date: string, site = DEFAULT_SITE) {
  return { date, site, plan: computeNight(date, site) };
}

export function fire(el: Element, type: 'input' | 'change' | 'click') {
  el.dispatchEvent(type === 'click' ? new MouseEvent('click', { bubbles: true }) : new Event(type, { bubbles: true }));
}

/** Set an input's value and fire `input` + `change`, as a browser does when the user edits it. */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  el.value = value;
  fire(el, 'input');
  fire(el, 'change');
}
