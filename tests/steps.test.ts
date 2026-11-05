import { describe, expect, it } from 'vitest';
import { computeNight } from '../src/astro/schedule';
import { DEFAULT_SITE } from '../src/config';
import { en } from '../src/i18n/en';
import { ko } from '../src/i18n/ko';
import { stepKey } from '../src/ui/steps';

describe('timeline step labels', () => {
  it('every step of a real plan maps to a short label key, in schedule order', () => {
    const p = computeNight('2026-11-11', DEFAULT_SITE);
    expect(p.timeline.map(stepKey)).toEqual(['arrive', 'focus', 'timeisBefore', 'start', 'twilightStart', 'twilightEnd', 'darkStart', 'darkEnd', 'end', 'timeisAfter']);
  });

  it('short labels are short in both languages', () => {
    for (const steps of [en.night.steps, ko.night.steps]) for (const v of Object.values(steps)) expect(v.length).toBeLessThanOrEqual(28);
  });
});
