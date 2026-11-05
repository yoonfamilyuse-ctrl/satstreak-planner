import { TIME_ZONE } from './config';

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hms = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const longDate = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

export const MIN_MS = 60_000;
export const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' of the KST calendar date containing `d`. */
export function kstDateString(d: Date): string {
  return ymd.format(d);
}

/** Today's KST date as 'YYYY-MM-DD'. */
export function todayKST(): string {
  return kstDateString(new Date());
}

/** Noon KST (03:00 UTC) of a 'YYYY-MM-DD' date. Used as the search start for "that evening". */
export function kstNoon(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12 - 9, 0, 0));
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(kstNoon(s).getTime());
}

export function addDays(dateStr: string, n: number): string {
  return kstDateString(new Date(kstNoon(dateStr).getTime() + n * DAY_MS));
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MIN_MS);
}

/** Calendar-day offset of `d` (in KST) relative to `baseDateStr`. */
export function dayOffset(d: Date, baseDateStr: string): number {
  return Math.round((kstNoon(kstDateString(d)).getTime() - kstNoon(baseDateStr).getTime()) / DAY_MS);
}

/** 'HH:MM' KST, with a '+1d' style suffix when the time falls on another day than `baseDateStr`. */
export function fmtHM(d: Date | null, baseDateStr?: string): string {
  if (!d) return '—';
  return hm.format(d) + daySuffix(d, baseDateStr);
}

export function fmtHMS(d: Date | null, baseDateStr?: string): string {
  if (!d) return '—';
  return hms.format(d) + daySuffix(d, baseDateStr);
}

function daySuffix(d: Date, base?: string): string {
  if (!base) return '';
  const off = dayOffset(d, base);
  return off === 0 ? '' : ` (${off > 0 ? '+' : ''}${off}d)`;
}

export function fmtLongDate(dateStr: string): string {
  return longDate.format(kstNoon(dateStr));
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / MIN_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' });
/** e.g. 'Wed 11 Nov'. A malformed date string is returned as is ('—' if empty) instead of throwing. */
export function fmtShortDate(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr || '—';
  return shortDate.format(kstNoon(dateStr)).replace(',', '');
}

const ymdhm = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** 'YYYY-MM-DD HH:MM' KST */
export function fmtDateTime(ms: number): string {
  return ymdhm.format(new Date(ms)).replace(',', '');
}
/** 'YYYYMMDD-HHMM' KST, for file names */
export function fileStamp(ms: number): string {
  return fmtDateTime(ms).replace(/[-:]/g, '').replace(' ', '-');
}
