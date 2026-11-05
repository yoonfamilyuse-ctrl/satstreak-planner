import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE } from '../src/config';
import { classifyCloud, classifyMoon, outlook, rate } from '../src/outlook';
import { cloudAverage, parseForecast, type CloudForecast } from '../src/weather/openmeteo';

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 11, 0); // 09:00 KST

function fc(values: (number | null)[]): CloudForecast {
  return {
    fetchedAt: 0,
    latitude: DEFAULT_SITE.latitude,
    longitude: DEFAULT_SITE.longitude,
    times: values.map((_, i) => T0 + i * H),
    total: values,
    low: values.map((v) => (v == null ? null : v / 2)),
    mid: values.map(() => 0),
    high: values.map(() => 100),
  };
}

describe('cloudAverage', () => {
  it('averages a constant series', () => {
    const f = fc([40, 40, 40, 40]);
    expect(cloudAverage(f, new Date(T0 + 0.5 * H), new Date(T0 + 2.5 * H))).toEqual({ total: 40, low: 20, mid: 0, high: 100 });
  });

  it('interpolates linearly between hours (0 → 60 over one hour averages 30)', () => {
    const f = fc([0, 60]);
    expect(cloudAverage(f, new Date(T0), new Date(T0 + H))!.total).toBeCloseTo(30, 6);
  });

  it('returns null outside the forecast range or on missing data', () => {
    expect(cloudAverage(fc([10, 10]), new Date(T0), new Date(T0 + 2 * H))).toBeNull();
    expect(cloudAverage(fc([10, null, 10]), new Date(T0), new Date(T0 + 2 * H))).toBeNull();
  });

  it('parses the Open-Meteo unixtime format', () => {
    const p = parseForecast(
      { hourly: { time: [1793804400], cloud_cover: [24], cloud_cover_low: [1], cloud_cover_mid: [2], cloud_cover_high: [3] } },
      DEFAULT_SITE,
      5,
    );
    expect(p.times[0]).toBe(1793804400000);
    expect(p.total[0]).toBe(24);
  });
});

describe('rating', () => {
  it('classifies', () => {
    expect(classifyMoon(0)).toBe('none');
    expect(classifyMoon(15)).toBe('low');
    expect(classifyMoon(80)).toBe('high');
    expect(classifyCloud(null)).toBe('unknown');
    expect(classifyCloud({ total: 30, low: 0, mid: 0, high: 0 })).toBe('clear');
    expect(classifyCloud({ total: 61, low: 0, mid: 0, high: 0 })).toBe('cloudy');
  });

  it('combines moon and cloud', () => {
    expect(rate('none', 'clear')).toBe('good');
    expect(rate('low', 'unknown')).toBe('fair');
    expect(rate('high', 'clear')).toBe('fair');
    expect(rate('high', 'cloudy')).toBe('poor');
    expect(rate(null, 'clear')).toBe('none');
  });

  it('14-night outlook from 2026-11-11: dark nights early, full Moon (24 Nov) rated high Moon', () => {
    const o = outlook('2026-11-11', DEFAULT_SITE, null);
    expect(o).toHaveLength(14);
    expect(o[0].moonClass).toBe('none');
    const full = o.find((n) => n.plan.dateStr === '2026-11-24')!;
    expect(full.moonClass).toBe('high');
    expect(full.moonIndex!).toBeGreaterThan(90);
    expect(o.every((n) => n.cloudClass === 'unknown')).toBe(true);
  });
});
