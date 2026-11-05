// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE } from '../src/config';
import { outlook } from '../src/outlook';
import { renderOutlook } from '../src/ui/outlook-view';

describe('14 nights (proof sheet)', () => {
  const nights = outlook('2026-11-05', DEFAULT_SITE, null);
  const el = document.createElement('div');

  it('one linked row per night, bands on every bar, Moon lanes only where the Moon is up', () => {
    el.innerHTML = renderOutlook(nights, { state: 'loading' });
    const rows = [...el.querySelectorAll('.ol-night')];
    expect(rows).toHaveLength(14);
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('#2026-11-05');
    expect(rows[0].textContent).toContain('Tonight');
    for (const r of rows) expect(r.querySelectorAll('.ol-band')).toHaveLength(2);
    nights.forEach((n, i) => {
      const lanes = rows[i].querySelectorAll('.ol-moon').length;
      if (n.plan.moon.samples.every((s) => s.altitude <= 0)) expect(lanes).toBe(0);
      else expect(lanes).toBeGreaterThan(0);
    });
    // The Moon is up all window on 17 Nov: one continuous lane, not one piece per 10-min sample.
    const i17 = nights.findIndex((n) => n.plan.dateStr === '2026-11-17');
    expect(rows[i17].querySelectorAll('.ol-moon')).toHaveLength(1);
  });

  it('circles good nights', () => {
    const marked = nights.map((n, i) => (i === 2 ? { ...n, rating: 'good' as const } : n));
    el.innerHTML = renderOutlook(marked, { state: 'ok', fetchedAt: Date.now() });
    expect(el.querySelectorAll('.ol-night.r-good')).toHaveLength(1);
    expect(el.textContent).toContain('1 good night, circled.');
  });

  it('reads in Korean with the glossary terms; times and numbers unchanged', async () => {
    const i18n = await import('../src/i18n');
    i18n.setLang('ko');
    try {
      el.innerHTML = renderOutlook(nights, { state: 'ok', fetchedAt: Date.UTC(2026, 10, 5, 6) });
      const t = el.textContent!;
      expect(t).toContain('앞으로 14일 밤');
      expect(t).toContain('오늘 밤');
      expect(t).toContain('18:18–20:25'); // window of 5 Nov, KST, unchanged
      expect(t).toContain('475장');
      expect(t).toContain('박명 / 어두운 구간');
      expect(t).toContain('15:00 KST');
      expect(t).not.toMatch(/Next 14 nights|shots|Moon up/);
    } finally {
      i18n.setLang('en');
    }
  });
});
