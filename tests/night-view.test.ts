// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeNight } from '../src/astro/schedule';
import { DEFAULT_SITE } from '../src/config';
import { NightView } from '../src/ui/night-view';

const DATE = '2026-11-11';
const plan = computeNight(DATE, DEFAULT_SITE);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Mount the Night view with the system clock at `utc`. */
function mount(utc: string, date = DATE) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utc));
  const el = document.createElement('div');
  document.body.append(el);
  const view = new NightView();
  view.render(el, date === DATE ? plan : computeNight(date, DEFAULT_SITE), undefined);
  return { el, view };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Night view (contact sheet)', () => {
  it('tonight during shooting: frame now, band, next step and a live update', () => {
    const { el, view } = mount('2026-11-11T10:41:00Z'); // 19:41:00 KST
    // 19:41:00 − 18:14:00 = 5220 s → frame ⌊5220/16⌋ + 1 = 327, inside the dark band 268–456.
    expect(text(el.querySelector('.now-big'))).toBe('327');
    expect(text(el.querySelector('#now-block'))).toContain('Dark band');
    expect(text(el.querySelector('#now-block'))).toContain('frames 268–456');
    expect(text(el.querySelector('#next-step'))).toContain('Dark band ends');
    expect(text(el.querySelector('#next-step'))).toContain('20:15:40');
    expect(el.querySelector('.fr.cur')?.getAttribute('data-n')).toBe('327');
    expect(el.querySelectorAll('.fr.shot').length).toBe(326);
    expect(el.querySelectorAll('.fr').length).toBe(plan.window!.shots);
    // Seven timeline steps lie before 19:41 (arrive … dark band begins).
    expect(el.querySelectorAll('#timeline li.past').length).toBe(7);
    // 16 s later the next frame is exposed.
    vi.advanceTimersByTime(16_000);
    expect(text(el.querySelector('.now-big'))).toBe('328');
    view.detach();
  });

  it('marks both bands on the whole-night bar at their planned frames', () => {
    const { el } = mount('2026-11-11T10:41:00Z');
    const bands = [...el.querySelectorAll<HTMLElement>('.nb-band')];
    expect(bands).toHaveLength(2);
    const pct = (n: number) => ((n - 1) / (plan.window!.shots - 1)) * 100;
    expect(parseFloat(bands[0].style.left)).toBeCloseTo(pct(20), 6);
    expect(parseFloat(bands[1].style.left)).toBeCloseTo(pct(268), 6);
    expect(el.querySelector('.nb-now')).not.toBeNull();
  });

  it('tapping a frame shows its true start and end time and band; Now returns', () => {
    const { el } = mount('2026-11-11T10:41:00Z');
    (el.querySelector('.fr[data-n="20"]') as HTMLElement).click();
    // Frame 20 starts at 18:14:00 + 19 × 16 s = 18:19:04 and ends 15 s later.
    expect(text(el.querySelector('#strip-info'))).toContain('Frame 20 · 18:19:04–18:19:19 · Twilight band');
    (el.querySelector('#strip-now') as HTMLElement).click();
    expect(text(el.querySelector('#strip-info'))).toContain('Frame 327 is being exposed');
  });

  it('another date shows the plan for an on-time start, with no "now"', () => {
    const { el } = mount('2026-11-05T10:41:00Z');
    expect(text(el.querySelector('.now-big'))).toBe('18:14');
    expect((el.querySelector('#next-step') as HTMLElement).hidden).toBe(true);
    expect(el.querySelector('.fr.cur')).toBeNull();
    expect(el.querySelector('.nb-now')).toBeNull();
    expect(el.querySelectorAll('#timeline li.past').length).toBe(0);
  });

  it('before and after shooting tonight', () => {
    let { el } = mount('2026-11-11T08:40:00Z'); // 17:40 KST
    expect(text(el.querySelector('#now-block'))).toContain('starts in 34 min');
    expect(text(el.querySelector('#next-step'))).toContain('Arrive and set up');
    document.body.innerHTML = '';
    ({ el } = mount('2026-11-11T12:00:00Z')); // 21:00 KST
    expect(text(el.querySelector('#now-block'))).toContain('Shooting done');
    expect((el.querySelector('#next-step') as HTMLElement).hidden).toBe(true);
    expect(el.querySelectorAll('.fr.shot').length).toBe(plan.window!.shots);
  });

  it('keeps the Sun table and method notes', () => {
    const { el } = mount('2026-11-11T10:41:00Z');
    expect(text(el)).toContain('Cross-check −6°, −12°, −18° and sunset against KASI');
    expect(text(el)).toContain('mid-exposure (frame start + exposure/2)');
    expect(text(el)).toContain('Astronomical twilight ends');
  });
});
