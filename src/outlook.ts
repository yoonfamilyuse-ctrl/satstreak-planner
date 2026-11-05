import type { Site } from './config';
import { computeNight, type NightPlan } from './astro/schedule';
import { cloudAverage, type CloudAverage, type CloudForecast } from './weather/openmeteo';
import { addDays } from './time';

/**
 * Criteria for highlighting a night. Kept simple and explicit so they can be stated in the paper.
 *
 * Moon interference index = illuminated fraction (%) × fraction of the shooting window the Moon is
 * above the horizon. 0 = no Moon at all; 100 = full Moon up for the whole window.
 */
export const CRITERIA = {
  moonNoneMax: 5, // index ≤ 5  → "no Moon" (e.g. thin crescent, or Moon up only briefly)
  moonLowMax: 20, // index ≤ 20 → "low Moon"
  cloudClearMax: 30, // mean total cloud ≤ 30 % → "clear"
  cloudPartlyMax: 60, // ≤ 60 % → "partly cloudy"
};

export type MoonClass = 'none' | 'low' | 'high';
export type CloudClass = 'clear' | 'partly' | 'cloudy' | 'unknown';
export type Rating = 'good' | 'fair' | 'poor' | 'none';

export interface OutlookNight {
  plan: NightPlan;
  moonIndex: number | null;
  moonClass: MoonClass | null;
  cloud: CloudAverage | null;
  cloudClass: CloudClass;
  rating: Rating;
}

export function moonIndex(plan: NightPlan): number | null {
  if (!plan.window) return null;
  const windowMin = plan.window.durationMs / 60_000;
  return plan.moon.illuminationPct * (plan.moon.minutesUp / windowMin);
}

export function classifyMoon(index: number): MoonClass {
  return index <= CRITERIA.moonNoneMax ? 'none' : index <= CRITERIA.moonLowMax ? 'low' : 'high';
}

export function classifyCloud(c: CloudAverage | null): CloudClass {
  if (!c) return 'unknown';
  return c.total <= CRITERIA.cloudClearMax ? 'clear' : c.total <= CRITERIA.cloudPartlyMax ? 'partly' : 'cloudy';
}

/**
 * good = Moon none/low AND clear sky.
 * fair = Moon none/low with partly cloudy or no forecast yet, or clear sky with a bright Moon.
 * poor = otherwise.  none = no complete shooting window.
 */
export function rate(moon: MoonClass | null, cloud: CloudClass): Rating {
  if (!moon) return 'none';
  const darkMoon = moon !== 'high';
  if (darkMoon && cloud === 'clear') return 'good';
  if (darkMoon && (cloud === 'partly' || cloud === 'unknown')) return 'fair';
  if (!darkMoon && cloud === 'clear') return 'fair';
  return 'poor';
}

export function evaluateNight(plan: NightPlan, fc: CloudForecast | null): OutlookNight {
  const idx = moonIndex(plan);
  const moonClass = idx === null ? null : classifyMoon(idx);
  const cloud = fc && plan.window ? cloudAverage(fc, plan.window.start, plan.window.end) : null;
  const cloudClass = classifyCloud(cloud);
  return { plan, moonIndex: idx, moonClass, cloud, cloudClass, rating: rate(moonClass, cloudClass) };
}

export function outlook(startDate: string, site: Site, fc: CloudForecast | null, days = 14): OutlookNight[] {
  return Array.from({ length: days }, (_, i) => evaluateNight(computeNight(addDays(startDate, i), site), fc));
}
