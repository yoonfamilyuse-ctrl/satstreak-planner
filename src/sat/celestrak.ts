/**
 * CelesTrak GP API client (https://celestrak.org/NORAD/documentation/gp-data-formats.php).
 *
 * Usage policy (CelesTrak, 2026): GP data are checked for updates only every 2 hours; repeat downloads of
 * the Active group before the next update are refused with HTTP 403, and more than 50 HTTP errors in 2 h
 * get the IP address blocked. So: at most one download per 2 h, never retry after an error (we wait
 * 2 h), and fall back to importing a file.
 */
export const CELESTRAK_ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json';
export const CELESTRAK_LABEL = 'CelesTrak GP · GROUP=active · FORMAT=json (OMM)';
export const MIN_INTERVAL_MS = 2 * 3_600_000;
const BLOCK_KEY = 'satstreak.celestrak.blockedUntil';

export function blockedUntil(): number {
  try {
    return Number(localStorage.getItem(BLOCK_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function block(ms: number) {
  try {
    localStorage.setItem(BLOCK_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

/** Earliest time a new download is allowed (ms), given the time of the last successful CelesTrak download. */
export function nextAllowedAt(lastDownloadAt: number | null): number {
  return Math.max(lastDownloadAt ? lastDownloadAt + MIN_INTERVAL_MS : 0, blockedUntil());
}

export class CelestrakError extends Error {}

export async function downloadActive(lastDownloadAt: number | null, now = Date.now()): Promise<{ text: string; downloadedAt: number }> {
  const next = nextAllowedAt(lastDownloadAt);
  if (now < next) throw new CelestrakError(`CelesTrak policy: next download allowed after ${new Date(next).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul' })} KST.`);
  let res: Response;
  try {
    res = await fetch(CELESTRAK_ACTIVE_URL, { cache: 'no-store' });
  } catch {
    // Network failure or CORS block. Do not retry automatically.
    block(now + 10 * 60_000);
    throw new CelestrakError('Could not reach CelesTrak (offline or blocked by the browser). Load a file instead.');
  }
  if (!res.ok) {
    block(now + MIN_INTERVAL_MS);
    const why = res.status === 403 ? 'already downloaded in this update cycle from this network, or rate-limited' : `HTTP ${res.status}`;
    throw new CelestrakError(`CelesTrak refused the request (${why}). Not retrying for 2 h. Load a file instead.`);
  }
  const text = await res.text();
  return { text, downloadedAt: Date.now() };
}
