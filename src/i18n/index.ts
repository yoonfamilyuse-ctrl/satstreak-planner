import { TIME_ZONE } from '../config';
import { isValidDateString, kstNoon } from '../time';
import { en, type Strings } from './en';
import { ko } from './ko';

/**
 * UI language. Default: the phone's language (Korean on a Korean iPhone, else English); the top-bar toggle switches
 * it and the choice is remembered like night mode. All UI strings live in en.ts / ko.ts; research terms follow
 * docs/glossary.md. Exports (CSV/JSON, bundle README) stay in English and do not use this module.
 */
export type Lang = 'ko' | 'en';
export const LANG_KEY = 'satstreak.lang';

function initial(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'ko' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : '';
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let lang: Lang = initial();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/** The strings of the current language. */
export function S(): Strings {
  return lang === 'ko' ? ko : en;
}

const fmt = (o: Intl.DateTimeFormatOptions) => ({
  en: new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, ...o }),
  ko: new Intl.DateTimeFormat('ko-KR', { timeZone: TIME_ZONE, ...o }),
});
const LONG = fmt({ weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
const SHORT = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const WD = fmt({ weekday: 'short' });
const DM = fmt({ month: 'short', day: 'numeric' });

/** 'Wed, 11 Nov 2026' / '2026년 11월 11일 (수)'. */
export function longDate(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr || '—';
  const d = kstNoon(dateStr);
  if (lang === 'ko') return koDate(d, true);
  return LONG.en.format(d);
}

/** 'Wed 11 Nov' / '11월 11일 (수)'. */
export function shortDate(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr || '—';
  const d = kstNoon(dateStr);
  return lang === 'ko' ? koDate(d, false) : SHORT.en.format(d).replace(',', '');
}

/** 'Wed' / '수'. */
export function weekday(dateStr: string): string {
  return WD[lang].format(kstNoon(dateStr));
}

/** '11 Nov' / '11월 11일'. */
export function dayMonth(dateStr: string): string {
  return DM[lang].format(kstNoon(dateStr));
}

function koDate(d: Date, withYear: boolean): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${withYear ? `${parts.year}년 ` : ''}${parts.month}월 ${parts.day}일 (${parts.weekday})`;
}

const PHASES: Record<string, string> = {
  'New Moon': '삭',
  'Waxing crescent': '초승달',
  'First quarter': '상현달',
  'Waxing gibbous': '차오르는 달',
  'Full Moon': '보름달',
  'Waning gibbous': '기우는 달',
  'Last quarter': '하현달',
  'Waning crescent': '그믐달',
};
/** Moon phase name from astro/moon.ts, in the current language. */
export function moonPhase(name: string): string {
  return lang === 'ko' ? (PHASES[name] ?? name) : name;
}
