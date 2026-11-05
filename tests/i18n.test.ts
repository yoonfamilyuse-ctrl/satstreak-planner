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
});
