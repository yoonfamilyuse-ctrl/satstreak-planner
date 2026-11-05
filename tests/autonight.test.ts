// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE } from '../src/config';
import { sunAltitude, sunEvents } from '../src/astro/sun';
import { darkSpans, decideTheme, currentDecision, OVERRIDE_KEY, refreshSpans, SPANS_KEY, userSetNight, type Span } from '../src/autonight';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (iso: string) => new Date(iso).getTime();

/** Node's built-in localStorage shadows happy-dom's and is unusable here; use a plain in-memory Storage. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
beforeEach(() => vi.stubGlobal('localStorage', new MemStorage()));
afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.auto;
});

describe('dark spans (Sun below −6°)', () => {
  it('start at the evening −6° crossing of the night plan and end at the next morning crossing', () => {
    const [span] = darkSpans(DEFAULT_SITE, '2026-11-11', 1);
    expect(span[0]).toBe(sunEvents('2026-11-11', DEFAULT_SITE).descending[-6]!.getTime()); // 17:47:40 KST
    expect(span[1] - span[0]).toBeGreaterThan(11 * 3600e3);
    expect(span[1] - span[0]).toBeLessThan(15 * 3600e3);
    expect(sunAltitude(new Date(span[1]), DEFAULT_SITE)).toBeCloseTo(-6, 2);
    expect(sunAltitude(new Date((span[0] + span[1]) / 2), DEFAULT_SITE)).toBeLessThan(-6);
  });

  it('refreshSpans covers yesterday evening to two weeks ahead and is quick', () => {
    const t0 = performance.now();
    refreshSpans(DEFAULT_SITE, '2026-11-11');
    expect(performance.now() - t0).toBeLessThan(500);
    const stored = JSON.parse(localStorage.getItem(SPANS_KEY)!);
    expect(stored.spans).toHaveLength(16);
    expect(stored.spans[0][0]).toBe(sunEvents('2026-11-10', DEFAULT_SITE).descending[-6]!.getTime());
  });
});

describe('theme decision', () => {
  const spans: Span[] = darkSpans(DEFAULT_SITE, '2026-11-11', 2);
  it('night when switched on; auto at night; day by day or after choosing day for that night', () => {
    expect(decideTheme(at('2026-11-11T03:00:00Z'), '1', spans, null)).toBe('night');
    expect(decideTheme(at('2026-11-11T03:00:00Z'), '0', spans, null)).toBe('day'); // 12:00 KST
    expect(decideTheme(at('2026-11-11T10:00:00Z'), '0', spans, null)).toBe('auto-night'); // 19:00 KST
    expect(decideTheme(at('2026-11-11T10:00:00Z'), null, spans, String(spans[0][0]))).toBe('day');
    // The choice applies to that night only.
    expect(decideTheme(at('2026-11-12T10:00:00Z'), null, spans, String(spans[0][0]))).toBe('auto-night');
  });

  it('switching to day inside a dark span is remembered until the next evening; switching on clears it', () => {
    refreshSpans(DEFAULT_SITE, '2026-11-11');
    const evening = at('2026-11-11T10:00:00Z');
    expect(currentDecision(evening)).toBe('auto-night');
    userSetNight(false, evening);
    expect(localStorage.getItem(OVERRIDE_KEY)).not.toBeNull();
    expect(currentDecision(evening + 3600e3)).toBe('day');
    expect(currentDecision(at('2026-11-12T10:00:00Z'))).toBe('auto-night');
    userSetNight(true, evening);
    expect(localStorage.getItem(OVERRIDE_KEY)).toBeNull();
    expect(currentDecision(at('2026-11-12T03:00:00Z'))).toBe('night');
  });
});

describe('first-paint script in index.html', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const run = (t: number) => {
    document.head.innerHTML = '<meta name="theme-color" content="#e9e7e2">';
    const realNow = Date.now;
    Date.now = () => t;
    try {
      new Function(inline)();
    } finally {
      Date.now = realNow;
    }
    return { theme: document.documentElement.dataset.theme, auto: document.documentElement.dataset.auto, meta: document.querySelector('meta')!.getAttribute('content') };
  };

  it('agrees with decideTheme', () => {
    refreshSpans(DEFAULT_SITE, '2026-11-11');
    const night = at('2026-11-11T10:00:00Z');
    expect(run(night)).toEqual({ theme: 'night', auto: '1', meta: '#000000' });
    afterEachReset();
    expect(run(at('2026-11-11T03:00:00Z'))).toEqual({ theme: undefined, auto: undefined, meta: '#e9e7e2' });
    afterEachReset();
    userSetNight(false, night);
    expect(run(night).theme).toBeUndefined();
    afterEachReset();
    localStorage.setItem('satstreak.night', '1');
    expect(run(at('2026-11-11T03:00:00Z'))).toEqual({ theme: 'night', auto: undefined, meta: '#000000' });
  });
});

function afterEachReset() {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.auto;
}
