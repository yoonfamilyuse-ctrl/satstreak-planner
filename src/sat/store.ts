/**
 * IndexedDB storage for element sets (research record).
 * Every downloaded or imported set is kept with its exact original text, so predictions for a night can
 * later be recomputed with the elements that were used that night (newer elements give different results).
 */
import type { ElementFormat } from './elements';
import type { FieldLog } from '../log/fieldlog';

export interface SetMeta {
  id: string;
  source: 'celestrak' | 'file' | 'paste';
  /** Human label: query or file name. */
  label: string;
  url?: string;
  /** When the data were downloaded / imported (ms UTC). */
  downloadedAt: number;
  format: ElementFormat;
  bytes: number;
  loaded: number;
  failed: number;
  /** Count of objects with catalog number ≥ 100000. */
  sixDigit: number;
  epochMin: number | null;
  epochMax: number | null;
  /** First parse failures (up to 50), for display. */
  failures: { id: string; reason: string }[];
}

export interface NightSet {
  date: string;
  setId: string;
  lockedAt: number;
  /** Earlier locks for this night, if it was changed. */
  history: { setId: string; lockedAt: number }[];
}

const DB_NAME = 'satstreak';
/** v1: sets, setData, nightSets. v2 (Stage 4): logs. Upgrades keep existing data. */
const DB_VERSION = 2;

export const BLOCKED_MESSAGE = 'This app is open in another tab or window with an older version. Close it, then reload this page.';

let dbp: Promise<IDBDatabase> | null = null;
/**
 * Open (and upgrade) the database. An upgrade waits until every other connection closes, so:
 *  - `blocked` (another tab still runs an older build and holds a connection) rejects with BLOCKED_MESSAGE
 *    instead of waiting forever; the next call tries again.
 *  - our connection closes itself on `versionchange`, so a newer build in another tab is never blocked by us.
 */
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    let gaveUp = false;
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('sets')) d.createObjectStore('sets', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('setData')) d.createObjectStore('setData', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('nightSets')) d.createObjectStore('nightSets', { keyPath: 'date' });
      if (!d.objectStoreNames.contains('logs')) d.createObjectStore('logs', { keyPath: 'id' });
    };
    req.onblocked = () => {
      gaveUp = true;
      if (dbp === p) dbp = null;
      reject(new Error(BLOCKED_MESSAGE));
    };
    req.onsuccess = () => {
      const d = req.result;
      if (gaveUp) return d.close(); // opened after we reported "blocked"; the next call opens again
      d.onversionchange = () => {
        d.close();
        if (dbp === p) dbp = null;
      };
      resolve(d);
    };
    req.onerror = () => {
      if (dbp === p) dbp = null;
      reject(req.error);
    };
  });
  dbp = p;
  return p;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(stores, mode);
        const r = fn(t);
        t.oncomplete = () => resolve(r ? (r.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

export async function listSets(): Promise<SetMeta[]> {
  const all = await tx<SetMeta[]>(['sets'], 'readonly', (t) => t.objectStore('sets').getAll());
  return all.sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export function putSet(meta: SetMeta, text: string): Promise<void> {
  return tx(['sets', 'setData'], 'readwrite', (t) => {
    t.objectStore('sets').put(meta);
    t.objectStore('setData').put({ id: meta.id, text });
  });
}

export async function getSetText(id: string): Promise<string | null> {
  const r = await tx<{ id: string; text: string } | undefined>(['setData'], 'readonly', (t) => t.objectStore('setData').get(id));
  return r?.text ?? null;
}

export function deleteSet(id: string): Promise<void> {
  return tx(['sets', 'setData'], 'readwrite', (t) => {
    t.objectStore('sets').delete(id);
    t.objectStore('setData').delete(id);
  });
}

export async function getNightSet(date: string): Promise<NightSet | null> {
  return (await tx<NightSet | undefined>(['nightSets'], 'readonly', (t) => t.objectStore('nightSets').get(date))) ?? null;
}

export async function listNightSets(): Promise<NightSet[]> {
  return tx<NightSet[]>(['nightSets'], 'readonly', (t) => t.objectStore('nightSets').getAll());
}

export async function lockNightSet(date: string, setId: string): Promise<NightSet> {
  const prev = await getNightSet(date);
  const rec: NightSet = {
    date,
    setId,
    lockedAt: Date.now(),
    history: prev && prev.setId !== setId ? [...prev.history, { setId: prev.setId, lockedAt: prev.lockedAt }] : (prev?.history ?? []),
  };
  await tx(['nightSets'], 'readwrite', (t) => {
    t.objectStore('nightSets').put(rec);
  });
  return rec;
}

// ---------------------------------------------------------------- field logs (Stage 4)

export async function listLogs(): Promise<FieldLog[]> {
  const all = await tx<FieldLog[]>(['logs'], 'readonly', (t) => t.objectStore('logs').getAll());
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

export async function getLog(id: string): Promise<FieldLog | null> {
  return (await tx<FieldLog | undefined>(['logs'], 'readonly', (t) => t.objectStore('logs').get(id))) ?? null;
}

export function putLog(log: FieldLog): Promise<void> {
  return tx(['logs'], 'readwrite', (t) => {
    t.objectStore('logs').put(log);
  });
}

export function deleteLog(id: string): Promise<void> {
  return tx(['logs'], 'readwrite', (t) => {
    t.objectStore('logs').delete(id);
  });
}

export async function getSetMeta(id: string): Promise<SetMeta | null> {
  return (await tx<SetMeta | undefined>(['sets'], 'readonly', (t) => t.objectStore('sets').get(id))) ?? null;
}
