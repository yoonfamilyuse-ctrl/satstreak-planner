import type { Site } from '../config';
import { MIN_MS } from '../time';

/**
 * Hourly cloud-cover forecast from Open-Meteo (https://open-meteo.com), free, no API key,
 * CC BY 4.0 data licence. Endpoint: https://api.open-meteo.com/v1/forecast
 * Variables: cloud_cover (total), cloud_cover_low (< ~2 km), cloud_cover_mid (~2–6 km),
 * cloud_cover_high (> ~6 km), in %, as instantaneous values at each hour. "best_match" model
 * selection (for Korea this blends the global and regional models Open-Meteo has available).
 */
export interface CloudForecast {
  fetchedAt: number;
  latitude: number;
  longitude: number;
  /** Hour timestamps, ms since epoch (UTC). */
  times: number[];
  total: (number | null)[];
  low: (number | null)[];
  mid: (number | null)[];
  high: (number | null)[];
}

export interface CloudAverage {
  total: number;
  low: number;
  mid: number;
  high: number;
}

export const FORECAST_DAYS = 16; // Open-Meteo maximum
const CACHE_KEY = 'satstreak.clouds';
/** Re-use a cached forecast for this long (Open-Meteo updates models roughly hourly). */
export const FORECAST_MAX_AGE_MS = 60 * MIN_MS;

export function forecastUrl(site: Site): string {
  const p = new URLSearchParams({
    latitude: site.latitude.toFixed(4),
    longitude: site.longitude.toFixed(4),
    hourly: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high',
    forecast_days: String(FORECAST_DAYS),
    timeformat: 'unixtime',
    timezone: 'Asia/Seoul',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

const sameSite = (fc: CloudForecast, site: Site) =>
  Math.abs(fc.latitude - site.latitude) < 0.01 && Math.abs(fc.longitude - site.longitude) < 0.01;

export function cachedForecast(site: Site, now = Date.now()): CloudForecast | null {
  try {
    const fc = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CloudForecast | null;
    if (fc && sameSite(fc, site) && now - fc.fetchedAt < FORECAST_MAX_AGE_MS) return fc;
  } catch {
    /* ignore */
  }
  return null;
}

export function parseForecast(json: any, site: Site, fetchedAt: number): CloudForecast {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('Unexpected Open-Meteo response');
  return {
    fetchedAt,
    latitude: site.latitude,
    longitude: site.longitude,
    times: h.time.map((t: number) => t * 1000),
    total: h.cloud_cover,
    low: h.cloud_cover_low,
    mid: h.cloud_cover_mid,
    high: h.cloud_cover_high,
  };
}

export async function fetchForecast(site: Site, { force = false } = {}): Promise<CloudForecast> {
  if (!force) {
    const c = cachedForecast(site);
    if (c) return c;
  }
  const res = await fetch(forecastUrl(site));
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const fc = parseForecast(await res.json(), site, Date.now());
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(fc));
  } catch {
    /* ignore */
  }
  return fc;
}

/** Linear interpolation of an hourly series at time t; null if outside range or a neighbour is missing. */
function interp(times: number[], v: (number | null)[], t: number): number | null {
  if (times.length < 2 || t < times[0] || t > times[times.length - 1]) return null;
  // times are hourly and evenly spaced
  const step = times[1] - times[0];
  const i = Math.min(Math.floor((t - times[0]) / step), times.length - 2);
  const a = v[i];
  const b = v[i + 1];
  if (a == null || b == null) return null;
  const f = (t - times[i]) / step;
  return a + (b - a) * f;
}

/**
 * Mean cloud cover over [start, end]: the hourly forecast is linearly interpolated and sampled
 * every `stepMin` minutes (inclusive of both ends), then averaged.
 * Returns null ("no forecast") if any sample falls outside the forecast range or on missing data.
 */
export function cloudAverage(fc: CloudForecast, start: Date, end: Date, stepMin = 10): CloudAverage | null {
  const ts: number[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += stepMin * MIN_MS) ts.push(t);
  ts.push(end.getTime());
  const out: CloudAverage = { total: 0, low: 0, mid: 0, high: 0 };
  for (const k of ['total', 'low', 'mid', 'high'] as const) {
    let sum = 0;
    for (const t of ts) {
      const x = interp(fc.times, fc[k], t);
      if (x === null) return null;
      sum += x;
    }
    out[k] = sum / ts.length;
  }
  return out;
}
