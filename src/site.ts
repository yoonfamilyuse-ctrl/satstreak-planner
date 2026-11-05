import { DEFAULT_SITE, type Site } from './config';

const KEY = 'satstreak.site';

export function validateSite(s: Partial<Site>): string | null {
  if (typeof s.latitude !== 'number' || !(s.latitude >= -90 && s.latitude <= 90)) return 'Latitude must be between −90 and 90.';
  if (typeof s.longitude !== 'number' || !(s.longitude >= -180 && s.longitude <= 180)) return 'Longitude must be between −180 and 180.';
  if (typeof s.elevation !== 'number' || !(s.elevation >= -500 && s.elevation <= 9000)) return 'Elevation must be between −500 and 9000 m.';
  return null;
}

export function loadSite(): Site {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Site;
      if (!validateSite(s)) return { ...DEFAULT_SITE, ...s };
    }
  } catch {
    /* storage unavailable or corrupt: fall back to default */
  }
  return { ...DEFAULT_SITE };
}

export function saveSite(s: Site): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function resetSite(): Site {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SITE };
}
