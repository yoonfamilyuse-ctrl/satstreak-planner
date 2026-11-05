import { json2satrec, twoline2satrec, type OMMJsonObject, type SatRec } from 'satellite.js';

/**
 * Orbital element sets.
 *
 * Primary format: CCSDS Orbit Mean-Elements Message (OMM) as JSON, from the CelesTrak GP API
 * (https://celestrak.org/NORAD/documentation/gp-data-formats.php). The classic two-line element
 * (TLE) format has only 5 digits for the catalog number. The U.S. Space Force ran out of 5-digit
 * numbers on 2026-07-11, and CelesTrak does not provide TLEs for objects numbered 100000+, so we
 * use OMM, which has no such limit.
 *
 * SGP4 initialisation: satellite.js `json2satrec` (OMM) / `twoline2satrec` (TLE fallback), which
 * port Vallado's SGP4 (Vallado, Crawford, Hujsak & Kelso 2006, "Revisiting Spacetrack Report #3",
 * AIAA 2006-6753), "improved" operation mode.
 */

export type ElementFormat = 'omm-json' | 'tle';

/**
 * Orbit regime, using Space-Track.org's definitions (mean motion n in rev/day, eccentricity e):
 * LEO: n > 11.25 and e < 0.25 (period < 128 min); GEO: 0.99 ≤ n ≤ 1.01 and e < 0.01;
 * HEO: e ≥ 0.25; MEO: period 600–800 min (1.8 ≤ n ≤ 2.4) and e < 0.25; otherwise 'other'.
 */
export type Regime = 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'other';

export function regimeOf(satrec: SatRec): Regime {
  const n = (satrec.no * 1440) / (2 * Math.PI); // satrec.no is rad/min (Kozai-corrected)
  const e = satrec.ecco;
  if (e >= 0.25) return 'HEO';
  if (n > 11.25) return 'LEO';
  if (n >= 0.99 && n <= 1.01 && e < 0.01) return 'GEO';
  if (n >= 1.8 && n <= 2.4) return 'MEO';
  return 'other';
}

export interface SatEntry {
  /** NORAD catalog number. */
  norad: number;
  regime: Regime;
  name: string;
  /** Element-set epoch (UTC, ms). */
  epoch: number;
  satrec: SatRec;
  /** Original OMM record (OMM input only). */
  omm?: OMMJsonObject;
}

export interface ParseFailure {
  id: string;
  reason: string;
}

export interface ParsedSet {
  format: ElementFormat;
  sats: SatEntry[];
  failures: ParseFailure[];
}

const OMM_REQUIRED = ['NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'] as const;

export function detectFormat(text: string): ElementFormat {
  const t = text.trimStart();
  return t.startsWith('[') || t.startsWith('{') ? 'omm-json' : 'tle';
}

export function parseElementText(text: string): ParsedSet {
  return detectFormat(text) === 'omm-json' ? parseOmmJson(text) : parseTle(text);
}

/** OMM epochs from CelesTrak have no time-zone suffix and are UTC. */
export function ommEpochMs(epoch: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`);
}

export function parseOmmJson(text: string): ParsedSet {
  const failures: ParseFailure[] = [];
  const sats: SatEntry[] = [];
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch (e) {
    return { format: 'omm-json', sats, failures: [{ id: 'file', reason: `Invalid JSON: ${(e as Error).message}` }] };
  }
  if (!Array.isArray(arr)) arr = [arr];
  (arr as any[]).forEach((o, i) => {
    const id = o?.NORAD_CAT_ID != null ? String(o.NORAD_CAT_ID) : `#${i}`;
    const missing = OMM_REQUIRED.filter((k) => o?.[k] === undefined || o?.[k] === null || o?.[k] === '');
    if (missing.length) return failures.push({ id, reason: `missing ${missing.join(', ')}` });
    const epoch = ommEpochMs(String(o.EPOCH));
    if (!Number.isFinite(epoch)) return failures.push({ id, reason: `bad EPOCH ${o.EPOCH}` });
    try {
      const satrec = json2satrec(o as OMMJsonObject);
      if (satrec.error) return failures.push({ id, reason: `SGP4 init error ${satrec.error}` });
      sats.push({ norad: Number(o.NORAD_CAT_ID), regime: regimeOf(satrec), name: String(o.OBJECT_NAME ?? id).trim(), epoch, satrec, omm: o });
    } catch (e) {
      failures.push({ id, reason: String((e as Error)?.message ?? e) });
    }
  });
  return { format: 'omm-json', sats, failures };
}

/** Alpha-5 catalog number decoding ('A0000' = 100000; letters I and O are skipped). */
export function decodeAlpha5(s: string): number {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const v = letters.indexOf(t[0].toUpperCase());
  if (v < 0 || !/^\d{4}$/.test(t.slice(1))) return NaN;
  return (v + 10) * 10000 + Number(t.slice(1));
}

/** Parse 2LE or 3LE (name line + two lines) text. Fallback when OMM is unavailable. */
export function parseTle(text: string): ParsedSet {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  const sats: SatEntry[] = [];
  const failures: ParseFailure[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('1 ')) {
      if (!(lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 '))) failures.push({ id: `line ${i + 1}`, reason: 'unrecognised line' });
      continue;
    }
    const l2 = lines[i + 1];
    const name = i > 0 && !lines[i - 1].startsWith('1 ') && !lines[i - 1].startsWith('2 ') ? lines[i - 1].replace(/^0 /, '').trim() : '';
    const id = l.slice(2, 7).trim();
    i++;
    if (!l2?.startsWith('2 ')) {
      failures.push({ id, reason: 'line 2 missing' });
      continue;
    }
    try {
      const satrec = twoline2satrec(l, l2);
      if (satrec.error) {
        failures.push({ id, reason: `SGP4 init error ${satrec.error}` });
        continue;
      }
      // satrec.jdsatepoch (+ jdsatepochF in newer versions) is the epoch as a Julian date.
      const jd = satrec.jdsatepoch + ((satrec as any).jdsatepochF ?? 0);
      sats.push({ norad: decodeAlpha5(id), regime: regimeOf(satrec), name: name || id, epoch: (jd - 2440587.5) * 86_400_000, satrec });
    } catch (e) {
      failures.push({ id, reason: String((e as Error)?.message ?? e) });
    }
  }
  return { format: 'tle', sats, failures };
}

// ---------------------------------------------------------------------------
// OMM → TLE text (for the research record; only for catalog numbers ≤ 99999)
// Column layout: CelesTrak "NORAD Two-Line Element Set Format"
// (https://celestrak.org/columns/v04n03/) and Vallado et al. 2006, Appendix.
// ---------------------------------------------------------------------------

/** TLE checksum: sum of digits, '-' counts as 1, modulo 10. */
export function tleChecksum(line: string): number {
  let s = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') s += ch.charCodeAt(0) - 48;
    else if (ch === '-') s += 1;
  }
  return s % 10;
}

/** "Decimal point assumed" exponential field, e.g. 0.00010236 → " 10236-3". */
export function tleExp(x: number): string {
  if (x === 0) return ' 00000+0';
  let e = Math.floor(Math.log10(Math.abs(x))) + 1;
  let m = Math.round((Math.abs(x) / 10 ** e) * 1e5);
  if (m >= 100000) {
    m = 10000;
    e += 1;
  }
  return `${x < 0 ? '-' : ' '}${String(m).padStart(5, '0')}${e < 0 ? '-' : '+'}${Math.abs(e)}`;
}

function fixed(x: number, width: number, decimals: number): string {
  return x.toFixed(decimals).padStart(width, ' ');
}

/** Returns [name, line1, line2], or null if the object cannot be written as a TLE (catalog number > 99999). */
export function ommToTle(o: OMMJsonObject): [string, string, string] | null {
  const norad = Number(o.NORAD_CAT_ID);
  if (!(norad >= 0 && norad <= 99999)) return null;
  const num = String(norad).padStart(5, '0');
  const cls = (o.CLASSIFICATION_TYPE || 'U').slice(0, 1);
  // International designator: '1998-067A' → '98067A'
  const m = /^(\d{4})-(\d{3})(\w*)$/.exec(String(o.OBJECT_ID ?? '').trim());
  const intl = (m ? m[1].slice(2) + m[2] + m[3] : '').padEnd(8, ' ').slice(0, 8);
  const ep = new Date(ommEpochMs(String(o.EPOCH)));
  const y = ep.getUTCFullYear();
  const doy = (ep.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1;
  const epoch = String(y % 100).padStart(2, '0') + doy.toFixed(8).padStart(12, '0');
  const ndot = Number(o.MEAN_MOTION_DOT);
  const ndotStr = (ndot < 0 ? '-' : ' ') + Math.abs(ndot).toFixed(8).replace(/^0/, '');
  const elset = String(Number(o.ELEMENT_SET_NO ?? 999) % 10000).padStart(4, ' ');
  const eph = String(o.EPHEMERIS_TYPE ?? 0).slice(0, 1);
  let l1 = `1 ${num}${cls} ${intl} ${epoch} ${ndotStr} ${tleExp(Number(o.MEAN_MOTION_DDOT))} ${tleExp(Number(o.BSTAR))} ${eph} ${elset}`;
  const ecc = Math.round(Number(o.ECCENTRICITY) * 1e7).toString().padStart(7, '0');
  const rev = String(Number(o.REV_AT_EPOCH ?? 0) % 100000).padStart(5, ' ');
  let l2 =
    `2 ${num} ${fixed(Number(o.INCLINATION), 8, 4)} ${fixed(Number(o.RA_OF_ASC_NODE), 8, 4)} ${ecc} ` +
    `${fixed(Number(o.ARG_OF_PERICENTER), 8, 4)} ${fixed(Number(o.MEAN_ANOMALY), 8, 4)} ${fixed(Number(o.MEAN_MOTION), 11, 8)}${rev}`;
  l1 += tleChecksum(l1);
  l2 += tleChecksum(l2);
  return [String(o.OBJECT_NAME ?? num).slice(0, 24), l1, l2];
}

/** 3LE text for every OMM record that fits the TLE format, plus the number skipped. */
export function ommArrayToTleText(records: OMMJsonObject[]): { text: string; written: number; skipped: number } {
  const out: string[] = [];
  let skipped = 0;
  for (const o of records) {
    const t = ommToTle(o);
    if (t) out.push(...t);
    else skipped++;
  }
  return { text: out.join('\n') + (out.length ? '\n' : ''), written: out.length / 3, skipped };
}
