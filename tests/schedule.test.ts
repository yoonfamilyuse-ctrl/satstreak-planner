import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE } from '../src/config';
import { computeNight, frameAt, shotsFor } from '../src/astro/schedule';
import { sunAltitude, SUN_ALTITUDES } from '../src/astro/sun';
import { fmtHMS, kstNoon } from '../src/time';
import { noaaSolarElevation } from './noaa';

const DATE = '2026-11-11';
const MIN = 60_000;

/** KST 'HH:MM:SS' on DATE → Date */
const kst = (hms: string) => {
  const [h, m, s] = hms.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 11, h - 9, m, s));
};

/**
 * Reference values (KST). Regression values from this app (astronomy-engine 2.1.19), confirmed
 * independently with the NOAA/Meeus solar formulas (e.g. Sun altitude at 18:19:00 = −12.005°).
 * An earlier PyEphem-based reference set was ~80 s late at every event and was discarded.
 */
const TOLERANCE_S = 30;

describe(`reference values, ${DATE}, default site (37.48°N 128.16°E 300 m)`, () => {
  const plan = computeNight(DATE, DEFAULT_SITE);
  const cases: [string, Date | null, string][] = [
    ['sunset', plan.sun.sunset, '17:19:59'],
    ['sun −12°', plan.sun.descending[-12], '18:19:00'],
    ['sun −20°', plan.sun.descending[-20], '18:59:57'],
    ['sun −25°', plan.sun.descending[-25], '19:25:15'],
    ['sun −35°', plan.sun.descending[-35], '20:15:40'],
  ];
  for (const [name, got, ref] of cases) {
    it(`${name} ≈ ${ref} KST (±${TOLERANCE_S} s)`, () => {
      expect(got).not.toBeNull();
      const diffS = Math.abs(got!.getTime() - kst(ref).getTime()) / 1000;
      expect(diffS, `${name}: got ${fmtHMS(got)} vs ${ref}`).toBeLessThanOrEqual(TOLERANCE_S);
    });
  }

  it('independent NOAA/Meeus solar elevation agrees at every computed crossing (±0.1° ≈ ±30 s)', () => {
    for (const a of SUN_ALTITUDES) {
      const t = plan.sun.descending[a]!;
      expect(Math.abs(noaaSolarElevation(t, DEFAULT_SITE.latitude, DEFAULT_SITE.longitude) - a)).toBeLessThan(0.1);
      expect(Math.abs(sunAltitude(t, DEFAULT_SITE) - a)).toBeLessThan(0.01);
    }
  });

  it('shooting window is t(−12°) − 5 min → t(−35°) + 5 min with ⌈duration/16 s⌉ shots', () => {
    const w = plan.window!;
    expect(w.start.getTime()).toBe(plan.sun.descending[-12]!.getTime() - 5 * MIN);
    expect(w.end.getTime()).toBe(plan.sun.descending[-35]!.getTime() + 5 * MIN);
    expect(w.shots).toBe(Math.ceil(w.durationMs / 16000));
    // ~2 h 07 min → ~477 shots
    expect(w.shots).toBeGreaterThan(440);
    expect(w.shots).toBeLessThan(500);
  });

  it('field timeline offsets', () => {
    const w = plan.window!;
    const at = (re: RegExp) => plan.timeline.find((i) => re.test(i.label))!.time.getTime();
    expect(at(/^Arrive/)).toBe(w.start.getTime() - 25 * MIN);
    expect(at(/^Focus/)).toBe(w.start.getTime() - 5 * MIN);
    expect(at(/time\.is.*before/)).toBeLessThan(w.start.getTime());
    expect(at(/^Start shooting/)).toBe(w.start.getTime());
    expect(at(/^End shooting/)).toBe(w.end.getTime());
    expect(at(/time\.is.*after/)).toBeGreaterThan(w.end.getTime());
    const times = plan.timeline.map((i) => i.time.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('moon: few days after new moon, small illumination, waxing', () => {
    expect(plan.moon.illuminationPct).toBeGreaterThan(0);
    expect(plan.moon.illuminationPct).toBeLessThan(15);
    expect(plan.moon.waxing).toBe(true);
    expect(plan.moon.samples[0].time.getTime()).toBe(plan.window!.start.getTime());
    expect(plan.moon.samples.at(-1)!.time.getTime()).toBe(plan.window!.end.getTime());
  });
});

describe('helpers and edge cases', () => {
  it('kstNoon is 03:00 UTC', () => {
    expect(kstNoon('2026-11-11').toISOString()).toBe('2026-11-11T03:00:00.000Z');
  });

  it('shotsFor rounds up', () => {
    expect(shotsFor(16000)).toBe(1);
    expect(shotsFor(16001)).toBe(2);
    expect(shotsFor(7200 * 1000)).toBe(450);
  });

  it('frameAt', () => {
    const w = { start: new Date(0), end: new Date(160_000), durationMs: 160_000, shots: 10 };
    expect(frameAt(w, new Date(0))).toBe(1);
    expect(frameAt(w, new Date(15_999))).toBe(1);
    expect(frameAt(w, new Date(16_000))).toBe(2);
    expect(frameAt(w, new Date(-1))).toBeNull();
  });

  it('midsummer: Sun never reaches −35° at 37.5°N → no window, with a warning', () => {
    const p = computeNight('2026-06-21', DEFAULT_SITE);
    expect(p.sun.descending[-35]).toBeNull();
    expect(p.window).toBeNull();
    expect(p.warnings.length).toBeGreaterThan(0);
  });
});
