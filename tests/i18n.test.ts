// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

/** Every key path, with the value's kind, so both languages must have the same keys and the same parameters. */
function shape(o: any, path = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'function' ? [`${path}${k}()/${v.length}`] : v && typeof v === 'object' ? shape(v, `${path}${k}.`) : [`${path}${k}`],
  );
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

describe('UI language', () => {
  it('Korean and English have exactly the same strings (keys and parameters)', () => {
    const exempt = (k: string) => k.startsWith('common.compass.') || k.startsWith('shell.siteErr.');
    expect(shape(ko).filter((k) => !exempt(k)).sort()).toEqual(shape(en).filter((k) => !exempt(k)).sort());
    expect(Object.keys(ko.shell.siteErr).sort()).toEqual(Object.keys(en.shell.siteErr).sort());
  });

  it('defaults to the phone language, and a stored choice wins', async () => {
    vi.stubGlobal('navigator', { language: 'ko-KR', languages: ['ko-KR', 'en-US'] });
    let m = await import('../src/i18n');
    expect(m.getLang()).toBe('ko');
    expect(m.S().shell.tonight).toBe('오늘 밤');
    vi.resetModules();
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
    m = await import('../src/i18n');
    expect(m.getLang()).toBe('en');
    m.setLang('ko');
    expect(localStorage.getItem('satstreak.lang')).toBe('ko');
    vi.resetModules();
    m = await import('../src/i18n');
    expect(m.getLang()).toBe('ko'); // remembered over the English phone setting
  });

  it('formats dates per language; times and numbers stay the same', async () => {
    vi.stubGlobal('navigator', { language: 'ko-KR' });
    const m = await import('../src/i18n');
    expect(m.longDate('2026-11-11')).toBe('2026년 11월 11일 (수)');
    expect(m.shortDate('2026-11-11')).toBe('11월 11일 (수)');
    expect(m.moonPhase('Waxing crescent')).toBe('초승달');
    m.setLang('en');
    expect(m.longDate('2026-11-11')).toBe('Wed, 11 Nov 2026');
    expect(m.shortDate('2026-11-11')).toBe('Wed 11 Nov');
    expect(m.moonPhase('Waxing crescent')).toBe('Waxing crescent');
  });

  it('Korean time words: 초, 분, 시간, 일; English unchanged', async () => {
    vi.stubGlobal('navigator', { language: 'ko-KR' });
    const m = await import('../src/i18n');
    const { fmtDuration, fmtHM } = await import('../src/time');
    expect(fmtDuration(127 * 60_000)).toBe('2시간 7분');
    expect(fmtDuration(35 * 60_000)).toBe('35분');
    expect(fmtHM(new Date('2026-11-12T00:54:00Z'), '2026-11-11')).toBe('09:54 (+1일)');
    expect(m.S().night.expInt(15, 16)).toBe('노출 15초, 간격 16초');
    m.setLang('en');
    expect(fmtDuration(127 * 60_000)).toBe('2 h 07 min');
    expect(fmtHM(new Date('2026-11-12T00:54:00Z'), '2026-11-11')).toBe('09:54 (+1d)');
  });

  it('Korean strings use no English time units (s, min, h, d after a number)', async () => {
    const shapeVals = (o: any): string[] => Object.values(o).flatMap((v: any) => (typeof v === 'function' ? [v.toString()] : v && typeof v === 'object' ? shapeVals(v) : [String(v)]));
    const bad = shapeVals(ko).filter((t) => /(\d|\})\s?(s|min|h|d)(?![A-Za-z])/.test(t.replace(/\$\{[a-z]+\}(?=[A-Za-z])/g, '')) && !/°\/s/.test(t));
    expect(bad).toEqual([]);
  });

  it('Korean terms: catalog objects are 물체 (never 천체); 화면 only for the time.is screen', () => {
    const entries = (o: any, path = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]: [string, any]) => (typeof v === 'function' ? [[path + k, v.toString()]] : v && typeof v === 'object' ? entries(v, `${path}${k}.`) : [[path + k, String(v)]]));
    const all = entries(ko);
    expect(all.filter(([, t]) => t.includes('천체')).map(([k]) => k)).toEqual([]);
    const screenOk = new Set(['night.steps.timeisBefore', 'night.steps.timeisAfter', 'log.clockNote', 'log.timeisScreen']);
    expect(all.filter(([k, t]) => t.includes('화면') && !screenOk.has(k)).map(([k]) => k)).toEqual([]);
  });
});
