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

describe('Satellites tab: ISS first', () => {
  it('shows the ISS crossing first, with its times and the planned frame numbers', async () => {
    const date = '2026-11-11';
    const ctx = ctxFor(date);
    const el = document.createElement('div');
    document.body.append(el);
    await store.putSet(meta('set', Date.now()), TEXT);
    const view = new SatView(() => ctx);
    view.render(el);
    await until(() => el.textContent?.includes(`Not locked for ${date}`), 3000, 'Satellites tab');
    expect(el.querySelector('.iss-card')?.textContent).toContain('Compute crossings to see whether the ISS crosses the frame');
    const entry = Date.UTC(2026, 10, 11, 9, 48, 18); // 18:48:18 KST
    const exit = Date.UTC(2026, 10, 11, 9, 49, 53);
    const iss = { norad: 25544, regime: 'LEO', name: 'ISS (ZARYA)', epoch: entry, entry, exit, entryClipped: false, exitClipped: false, maxAlt: 70, entryAz: 200, entryAlt: 40, exitAz: 100, exitAlt: 60, band: 'twilight', magRel: -1, samples: [], m1000: null, magKey: null, merged: [], train: [] };
    const r = { objects: 1, propagationFailed: 0, mergedObjects: 0, stationMerged: 0, crossings: [iss], tracks: [], pointing: [], steps: 1, elapsedMs: 1 };
    (view as any).result = { key: (view as any).resultKey(), setId: 'set', r, issPasses: [] };
    view.render(el);
    const first = el.querySelector('section.block')!;
    const card = first.querySelector('.iss-card.yes')!;
    expect(card.textContent).toContain('Crosses this frame tonight');
    expect(card.textContent).toContain('18:48:18');
    expect(card.textContent).toContain('18:49:53');
    // 18:48:18 − 18:14:00 = 2058 s → frame 129; 18:49:53 → 2153 s → frame 135 (frameAt, 16-s interval).
    expect(card.textContent).toContain('Frames 129–135');
    expect(el.querySelector('tr.iss-row')).not.toBeNull();
  });
});

describe('Satellites tab: crossing list cells', () => {
  it('keeps each detection limit and the trail length on one line (break-ui #2)', async () => {
    const date = '2026-11-11';
    const ctx = ctxFor(date);
    const el = document.createElement('div');
    document.body.append(el);
    await store.putSet(meta('set', Date.now()), TEXT);
    const view = new SatView(() => ctx);
    view.render(el);
    await until(() => el.textContent?.includes(`Not locked for ${date}`), 3000, 'Satellites tab');
    const t = Date.UTC(2026, 10, 11, 9, 48, 18);
    const c = { norad: 25544, regime: 'LEO', name: 'ISS (ZARYA)', epoch: t, entry: t, exit: t + 95_000, entryClipped: false, exitClipped: false, maxAlt: 70, entryAz: 200, entryAlt: 40, exitAz: 100, exitAlt: 60, band: 'twilight', magRel: -2.7, samples: [[-2.7, 1.2]], m1000: -1.3, magKey: 'iss', merged: [], train: [] };
    const r = { objects: 1, propagationFailed: 0, mergedObjects: 0, stationMerged: 0, crossings: [c], tracks: [], pointing: [], steps: 1, elapsedMs: 1 };
    (view as any).result = { key: (view as any).resultKey(), setId: 'set', r, issPasses: [] };
    view.render(el);
    const lims = el.querySelectorAll('tr.iss-row .mag-lims .nw');
    expect([...lims].map((x) => x.textContent![0])).toEqual(['P', 'M']);
    expect(el.querySelector('tr.iss-row .sec.nw')?.textContent).toMatch(/px$/);
  });
});

describe('Satellites tab: longest real object name in the crossing list (break-ui #9)', () => {
  it('a forced crossing of DB GME UT (DB-GLOBE MISSION EARTH-UT) shows the full name, wrapping at spaces', async () => {
    const { parseOmmJson } = await import('../src/sat/elements');
    const { predictCrossings } = await import('../src/sat/predict');
    const { DEFAULT_CAMERA } = await import('../src/sat/fov');
    // Real record from the 2026-11-05 CelesTrak active download. These sun-synchronous objects never pass during the
    // evening window, so the camera is pointed at a sunlit daytime pass instead (11 Nov, 14:52–14:57 KST, due south).
    const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/celestrak-long-names-2026-11-05.json'), 'utf8');
    const sats = parseOmmJson(text).sats.filter((s) => s.norad === 68459);
    const date = '2026-11-11';
    const ctx = ctxFor(date);
    const r = predictCrossings(sats, { start: Date.UTC(2026, 10, 11, 5, 50), end: Date.UTC(2026, 10, 11, 6, 0), stepS: 10, site: ctx.site, camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 45 }, pointing: [], phaseLaw: 'fraction' });
    expect(r.crossings.map((c) => c.norad)).toEqual([68459]);
    const el = document.createElement('div');
    document.body.append(el);
    await store.putSet(meta('set', Date.now()), TEXT);
    const view = new SatView(() => ctx);
    view.render(el);
    await until(() => el.textContent?.includes(`Not locked for ${date}`), 3000, 'Satellites tab');
    (view as any).result = { key: (view as any).resultKey(), setId: 'set', r, issPasses: [] };
    view.render(el);
    const cell = [...el.querySelectorAll('.scroll-y tbody td')].find((td) => td.textContent?.includes('68459'))!;
    expect(cell.textContent).toContain('DB GME UT (DB-GLOBE MISSION EARTH-UT)');
    expect(cell.innerHTML).not.toMatch(/nowrap|nw/); // the name may wrap at its spaces and hyphens
  });
});

describe('Satellites tab in Korean', () => {
  it('ISS card and list use the glossary terms; times and frame numbers unchanged', async () => {
    const i18n = await import('../src/i18n');
    i18n.setLang('ko');
    try {
      const date = '2026-11-11';
      const ctx = ctxFor(date);
      const el = document.createElement('div');
      document.body.append(el);
      await store.putSet(meta('set', Date.now()), TEXT);
      const view = new SatView(() => ctx);
      view.render(el);
      await until(() => el.textContent?.includes('고정된 궤도 요소가 없어요'), 3000, 'Korean Satellites tab');
      const entry = Date.UTC(2026, 10, 11, 9, 48, 18);
      const iss = { norad: 25544, regime: 'LEO', name: 'ISS (ZARYA)', epoch: entry, entry, exit: entry + 95_000, entryClipped: false, exitClipped: false, maxAlt: 70, entryAz: 200, entryAlt: 40, exitAz: 100, exitAlt: 60, band: 'twilight', magRel: -2.7, samples: [[-2.7, 1.2]], m1000: -1.3, magKey: 'iss', merged: [], train: [] };
      const r = { objects: 1, propagationFailed: 0, mergedObjects: 0, stationMerged: 0, crossings: [iss], tracks: [], pointing: [], steps: 1, elapsedMs: 1 };
      (view as any).result = { key: (view as any).resultKey(), setId: 'set', r, issPasses: [] };
      view.render(el);
      const card = el.querySelector('.iss-card.yes')!.textContent!;
      expect(card).toContain('오늘 밤 이 화각을 지나가요');
      expect(card).toContain('18:48:18');
      expect(card).toContain('프레임 129–135');
      expect(card).toContain('박명 구간');
      expect(card).toMatch(/검출 (가능|불가)/);
      expect(el.textContent).toContain('화각 통과 (1)');
      expect(card).toContain('화각 안 95초');
      expect(el.textContent).toContain('Hainaut &amp; Williams 2020'.replace('&amp;', '&')); // citation kept
    } finally {
      i18n.setLang('en');
    }
  });
});

describe('Satellites tab: band names in running text', () => {
  it('uses the glossary names 박명 구간 / 어두운 구간, never the short edge labels (Korean review #4)', async () => {
    const { ko } = await import('../src/i18n/ko');
    const { en } = await import('../src/i18n/en');
    expect(ko.sats.bandMin(ko.common.band.dark, '50')).toBe('어두운 구간 · 50분');
    expect(ko.sats.bandOf(ko.common.band.twilight)).toBe('박명 구간');
    expect(en.sats.bandMin(en.common.band.dark, '50')).toBe('Dark band · 50 min');
    const i18n = await import('../src/i18n');
    i18n.setLang('ko');
    try {
      const date = '2026-11-11';
      const ctx = ctxFor(date);
      const el = document.createElement('div');
      document.body.append(el);
      await store.putSet(meta('set', Date.now()), TEXT);
      const view = new SatView(() => ctx);
      view.render(el);
      await until(() => el.textContent?.includes('고정된 궤도 요소가 없어요'), 3000, 'Korean Satellites tab');
      const t = Date.UTC(2026, 10, 11, 10, 41);
      const mk = (norad: number, band: string) => ({ norad, regime: 'LEO', name: `SAT ${norad}`, epoch: t, entry: t, exit: t + 20_000, entryClipped: false, exitClipped: false, maxAlt: 50, entryAz: 0, entryAlt: 40, exitAz: 10, exitAlt: 45, band, magRel: 0, samples: [], m1000: null, magKey: null, merged: [], train: [] });
      const iss = { ...mk(25544, 'dark'), name: 'ISS (ZARYA)' };
      const r = { objects: 3, propagationFailed: 0, mergedObjects: 0, stationMerged: 0, crossings: [iss, mk(1, 'twilight'), mk(2, 'dark')], tracks: [], pointing: [], steps: 1, elapsedMs: 1 };
      (view as any).result = { key: (view as any).resultKey(), setId: 'set', r, issPasses: [] };
      view.render(el);
      const txt = el.textContent!;
      expect(txt).not.toContain('어둠 구간');
      expect(txt).not.toContain('박명 구간 구간');
      expect(txt).toContain('어두운 구간 · ');
      expect(el.querySelector('.iss-line')!.textContent).toContain('어두운 구간');
    } finally {
      i18n.setLang('en');
    }
  });
});
