import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { propagate, twoline2satrec } from 'satellite.js';
import { DEFAULT_SITE } from '../src/config';
import { compass } from '../src/astro/moon';
import { decodeAlpha5, ommArrayToTleText, ommToTle, parseElementText, parseTle, tleChecksum, tleExp } from '../src/sat/elements';
import { DEFAULT_CAMERA, fieldOfView, gnomonic, inFov, inverseGnomonic, makeFov } from '../src/sat/fov';
import { findPasses, isSunlit, predictCrossings, R_EARTH_KM } from '../src/sat/predict';

/** Real CelesTrak GP data (GROUP=active, FORMAT=json) downloaded 2026-11-04 23:37 UTC, 17-object subset. */
const FIXTURE = readFileSync(new URL('./fixtures/celestrak-active-sample-2026-11-04.json', import.meta.url), 'utf8');
const OMM = JSON.parse(FIXTURE);

describe('OMM element sets', () => {
  const parsed = parseElementText(FIXTURE);

  it('loads every record, with no parse failures', () => {
    expect(parsed.format).toBe('omm-json');
    expect(parsed.failures).toEqual([]);
    expect(parsed.sats).toHaveLength(OMM.length);
  });

  it('loads and propagates objects with catalog numbers ≥ 100000', () => {
    const big = parsed.sats.filter((s) => s.norad >= 100000);
    expect(big.length).toBeGreaterThanOrEqual(5);
    expect(big.map((s) => s.norad)).toContain(100000);
    expect(big.map((s) => s.norad)).toContain(101257);
    for (const s of big) {
      const pv = propagate(s.satrec, new Date(s.epoch + 3_600_000));
      expect(pv, `${s.norad} propagation`).not.toBeNull();
      const r = Math.hypot(pv!.position.x, pv!.position.y, pv!.position.z);
      expect(r, `${s.norad} radius`).toBeGreaterThan(R_EARTH_KM + 150);
      expect(r).toBeLessThan(R_EARTH_KM + 40000);
    }
  });

  it('counts malformed records as parse failures instead of crashing', () => {
    const bad = JSON.stringify([OMM[0], { NORAD_CAT_ID: 1, OBJECT_NAME: 'BROKEN' }, { ...OMM[1], MEAN_MOTION: 'abc', EPOCH: 'not a date' }]);
    const p = parseElementText(bad);
    expect(p.sats).toHaveLength(1);
    expect(p.failures).toHaveLength(2);
    expect(parseElementText('{not json').failures).toHaveLength(1);
  });
});

describe('OMM → TLE export', () => {
  it('formats exponent fields and checksums', () => {
    expect(tleExp(0.00010236)).toBe(' 10236-3');
    expect(tleExp(-1.2345e-5)).toBe('-12345-4');
    expect(tleExp(0)).toBe(' 00000+0');
    // Published ISS TLE line (CelesTrak documentation example) has checksum 7.
    expect(tleChecksum('1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927')).toBe(7);
  });

  it('writes ISS as a valid TLE whose SGP4 propagation matches the OMM to < 20 m', () => {
    const iss = OMM.find((o: any) => o.NORAD_CAT_ID === 25544);
    const [name, l1, l2] = ommToTle(iss)!;
    expect(name).toBe('ISS (ZARYA)');
    expect(l1).toHaveLength(69);
    expect(l2).toHaveLength(69);
    expect(l1.startsWith('1 25544U 98067A   26308.')).toBe(true);
    const fromTle = parseTle(`${name}\n${l1}\n${l2}`).sats[0];
    const fromOmm = parseElementText(JSON.stringify([iss])).sats[0];
    for (const h of [0, 24, 24 * 7]) {
      const t = new Date(fromOmm.epoch + h * 3_600_000);
      const a = propagate(fromTle.satrec, t)!.position;
      const b = propagate(fromOmm.satrec, t)!.position;
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 1000, `after ${h} h`).toBeLessThan(20);
    }
  });

  it('skips objects that do not fit (catalog number > 99999)', () => {
    expect(ommToTle(OMM.find((o: any) => o.NORAD_CAT_ID === 100000))).toBeNull();
    const r = ommArrayToTleText(OMM);
    expect(r.skipped).toBe(OMM.filter((o: any) => o.NORAD_CAT_ID > 99999).length);
    expect(r.written + r.skipped).toBe(OMM.length);
    const back = parseTle(r.text);
    expect(back.failures).toEqual([]);
    expect(back.sats).toHaveLength(r.written);
    expect(twoline2satrec(r.text.split('\n')[1], r.text.split('\n')[2]).error).toBe(0);
  });

  it('decodes Alpha-5', () => {
    expect(decodeAlpha5('25544')).toBe(25544);
    expect(decodeAlpha5('A0000')).toBe(100000);
    expect(decodeAlpha5('J0001')).toBe(180001); // I is skipped
  });
});

describe('field of view', () => {
  it('28 mm on 35.9 × 24 mm ≈ 65.3° × 46.4°', () => {
    const f = fieldOfView(DEFAULT_CAMERA);
    expect(f.horizontal).toBeCloseTo(65.3, 1);
    expect(f.vertical).toBeCloseTo(46.4, 1);
  });

  it('gnomonic edges match the half-angles, and inverse ∘ forward = identity', () => {
    const cam = { ...DEFAULT_CAMERA, azimuth: 120, altitude: 50 };
    const fov = makeFov(cam);
    const D = Math.PI / 180;
    const half = fieldOfView(cam).vertical / 2;
    expect(inFov(fov, 120 * D, (50 + half - 0.01) * D)).toBe(true);
    expect(inFov(fov, 120 * D, (50 + half + 0.01) * D)).toBe(false);
    expect(inFov(fov, 300 * D, 50 * D)).toBe(false); // behind the camera
    for (const [az, alt] of [[100, 40], [140, 70], [120, 50]]) {
      const p = gnomonic(fov, az * D, alt * D)!;
      const back = inverseGnomonic(fov, p.x, p.y);
      expect(back.az).toBeCloseTo(az, 6);
      expect(back.alt).toBeCloseTo(alt, 6);
    }
  });

  it('cylindrical shadow', () => {
    const s: [number, number, number] = [1, 0, 0];
    expect(isSunlit({ x: 7000, y: 0, z: 0 }, s)).toBe(true);
    expect(isSunlit({ x: -7000, y: 0, z: 0 }, s)).toBe(false);
    expect(isSunlit({ x: -7000, y: 6400, z: 0 }, s)).toBe(true);
  });
});

describe('camera-crossing prediction (sample set, 2026-11-11 window)', () => {
  it('runs, reports per-band crossings and stays consistent', () => {
    const sats = parseElementText(FIXTURE).sats;
    const start = Date.UTC(2026, 10, 11, 9, 14, 0);
    const end = Date.UTC(2026, 10, 11, 11, 20, 40);
    const r = predictCrossings(sats, {
      start,
      end,
      stepS: 10,
      site: DEFAULT_SITE,
      camera: { ...DEFAULT_CAMERA, azimuth: 135, altitude: 60 },
      pointing: [],
    });
    expect(r.objects).toBe(sats.length);
    for (const c of r.crossings) {
      expect(c.exit).toBeGreaterThanOrEqual(c.entry);
      expect(c.entry).toBeGreaterThanOrEqual(start);
      expect(c.exit).toBeLessThanOrEqual(end);
    }
    // The ISS passes at 70° through the SE (18:46–18:50 KST) in the twilight band.
    const iss = r.crossings.find((c) => c.norad === 25544);
    expect(iss?.band).toBe('twilight');
  });
});

/**
 * Heavens-Above "ISS – Visible Passes" for 37.4800°N 128.1600°E, 300 m (fetched 2026-11-04 23:38 UTC,
 * elements of 4 Nov). Times UTC. Start/End = alt 10° or shadow boundary; Highest = highest visible point.
 */
const HEAVENS_ABOVE = [
  { start: '2026-11-09T09:45:53Z', startAlt: 10, max: '2026-11-09T09:47:38Z', maxAlt: 19, end: '2026-11-09T09:47:38Z', endAlt: 19, dirs: ['S', 'SSE', 'SSE'] },
  { start: '2026-11-10T08:59:48Z', startAlt: 10, max: '2026-11-10T09:00:57Z', maxAlt: 11, end: '2026-11-10T09:02:07Z', endAlt: 10, dirs: ['SSE', 'SE', 'ESE'] },
  { start: '2026-11-10T10:34:02Z', startAlt: 10, max: '2026-11-10T10:35:24Z', maxAlt: 22, end: '2026-11-10T10:35:24Z', endAlt: 22, dirs: ['WSW', 'WSW', 'WSW'] },
  { start: '2026-11-11T09:46:22Z', startAlt: 10, max: '2026-11-11T09:49:40Z', maxAlt: 70, end: '2026-11-11T09:50:05Z', endAlt: 60, dirs: ['SW', 'SE', 'E'] },
  { start: '2026-11-12T08:58:59Z', startAlt: 10, max: '2026-11-12T09:02:03Z', maxAlt: 36, end: '2026-11-12T09:04:40Z', endAlt: 13, dirs: ['SSW', 'SE', 'ENE'] },
  { start: '2026-11-12T10:36:08Z', startAlt: 10, max: '2026-11-12T10:37:38Z', maxAlt: 19, end: '2026-11-12T10:37:38Z', endAlt: 19, dirs: ['W', 'WNW', 'WNW'] },
  { start: '2026-11-13T09:47:59Z', startAlt: 10, max: '2026-11-13T09:51:07Z', maxAlt: 37, end: '2026-11-13T09:52:06Z', endAlt: 29, dirs: ['WSW', 'NW', 'N'] },
];

describe('ISS visible passes vs Heavens-Above (±60 s, ±2°)', () => {
  const iss = parseElementText(FIXTURE).sats.find((s) => s.norad === 25544)!;
  const passes = findPasses(iss, { start: Date.UTC(2026, 10, 5), end: Date.UTC(2026, 10, 14), site: DEFAULT_SITE }).filter((p) => p.visible);
  const rows: Record<string, string | number>[] = [];

  for (const ha of HEAVENS_ABOVE) {
    it(`pass starting ${ha.start}`, () => {
      const p = passes.find((x) => Math.abs(x.visible!.start.t - Date.parse(ha.start)) < 5 * 60_000);
      expect(p, 'matching pass').toBeDefined();
      const v = p!.visible!;
      const d = (a: number, b: string) => (a - Date.parse(b)) / 1000;
      const dStart = d(v.start.t, ha.start);
      const dMax = d(v.max.t, ha.max);
      const dEnd = d(v.end.t, ha.end);
      rows.push({ start: ha.start, dStart: dStart.toFixed(1), dMax: dMax.toFixed(1), dEnd: dEnd.toFixed(1), maxAlt: `${v.max.alt.toFixed(1)} vs ${ha.maxAlt}`, endAlt: `${v.end.alt.toFixed(1)} vs ${ha.endAlt}` });
      expect(Math.abs(dStart)).toBeLessThanOrEqual(60);
      expect(Math.abs(dMax)).toBeLessThanOrEqual(60);
      expect(Math.abs(dEnd)).toBeLessThanOrEqual(60);
      expect(Math.abs(v.max.alt - ha.maxAlt)).toBeLessThanOrEqual(2);
      expect(Math.abs(v.end.alt - ha.endAlt)).toBeLessThanOrEqual(2);
      expect([compass(v.start.az), compass(v.max.az), compass(v.end.az)]).toEqual(ha.dirs);
    });
  }

  it('no extra visible passes that Heavens-Above does not list', () => {
    const extra = passes.filter((p) => !HEAVENS_ABOVE.some((ha) => Math.abs(p.visible!.start.t - Date.parse(ha.start)) < 5 * 60_000));
    if (process.env.SHOW_PASSES) console.table(rows);
    expect(extra.map((p) => new Date(p.visible!.start.t).toISOString())).toEqual([]);
  });
});

describe('orbit regime (Space-Track definitions)', () => {
  it('classifies LEO / GEO / MEO / HEO', async () => {
    const { regimeOf } = await import('../src/sat/elements');
    const sat = (n: number, e: number) => ({ no: (n * 2 * Math.PI) / 1440, ecco: e }) as any;
    expect(regimeOf(sat(15.5, 0.0007))).toBe('LEO'); // ISS
    expect(regimeOf(sat(1.0027, 0.0002))).toBe('GEO');
    expect(regimeOf(sat(2.0056, 0.01))).toBe('MEO'); // GPS
    expect(regimeOf(sat(2.0, 0.7))).toBe('HEO'); // Molniya
    expect(parseElementText(FIXTURE).sats.find((s) => s.norad === 25544)!.regime).toBe('LEO');
  });
});

/** Heavens-Above "Brightness (mag)" for the same 7 passes (brightest point of the visible pass). */
const HA_MAG: [string, number][] = [
  ['2026-11-09T09:45:53Z', -1.9],
  ['2026-11-10T08:59:48Z', -1.5],
  ['2026-11-10T10:34:02Z', -1.4],
  ['2026-11-11T09:46:22Z', -3.9],
  ['2026-11-12T08:58:59Z', -3.0],
  ['2026-11-12T10:36:08Z', -1.1],
  ['2026-11-13T09:47:59Z', -2.6],
];

describe('predicted magnitudes', () => {
  it('phase laws are 0 at 90° and brighter at small phase angles', async () => {
    const { phaseTerm, visualMagnitude } = await import('../src/sat/magnitude');
    for (const law of ['fraction', 'lambert'] as const) {
      expect(phaseTerm(Math.PI / 2, law)).toBeCloseTo(0, 12);
      expect(phaseTerm(0.3, law)).toBeLessThan(0);
      expect(phaseTerm(2.5, law)).toBeGreaterThan(0);
    }
    expect(visualMagnitude(7, 1000, Math.PI / 2)).toBeCloseTo(7, 12);
    expect(visualMagnitude(7, 2000, Math.PI / 2)).toBeCloseTo(7 + 5 * Math.log10(2), 12);
  });

  it('assigns cited intrinsic magnitudes by object', async () => {
    const { intrinsicFor } = await import('../src/sat/magnitude');
    expect(intrinsicFor({ norad: 25544, name: 'ISS (ZARYA)' })?.m1000).toBe(-1.8);
    expect(intrinsicFor({ norad: 1, name: 'STARLINK-30000', cospar: '2023-026A' })?.key).toBe('SL-Mini-550');
    expect(intrinsicFor({ norad: 1, name: 'STARLINK-11072 [DTC]', cospar: '2024-002A' })?.key).toBe('SL-Mini-DTC');
    expect(intrinsicFor({ norad: 1, name: 'STARLINK-1007', cospar: '2019-074A' })?.key).toBe('SL-V1.0');
    expect(intrinsicFor({ norad: 1, name: 'ONEWEB-0012', cospar: '2019-010A' })?.key).toBe('OneWeb');
    expect(intrinsicFor({ norad: 1, name: 'COSMOS 2251' })).toBeNull();
    const big = parseElementText(FIXTURE).sats.find((s) => s.norad === 100001)!; // STARLINK-38128
    expect(big.intrinsic?.key).toBe('SL-Mini-550');
  });

  for (const [law, maxRms] of [['fraction', 0.4], ['lambert', 0.8]] as const) {
    it(`ISS brightness vs Heavens-Above, ${law} law (rms ≤ ${maxRms} mag)`, () => {
      const iss = parseElementText(FIXTURE).sats.find((s) => s.norad === 25544)!;
      const passes = findPasses(iss, { start: Date.UTC(2026, 10, 5), end: Date.UTC(2026, 10, 14), site: DEFAULT_SITE, phaseLaw: law }).filter((p) => p.visible);
      const d = HA_MAG.map(([t, m]) => passes.find((p) => Math.abs(p.visible!.start.t - Date.parse(t)) < 300_000)!.brightest!.mag - m);
      const mean = d.reduce((a, b) => a + b) / d.length;
      const rms = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length);
      if (process.env.SHOW_PASSES) console.log(law, d.map((x) => x.toFixed(2)).join(' '), 'mean', mean.toFixed(2), 'rms', rms.toFixed(2));
      expect(Math.abs(mean)).toBeLessThan(0.3);
      expect(rms).toBeLessThanOrEqual(maxRms);
    });
  }
});

describe('co-located objects', () => {
  it('counts the ISS once even though its docked modules are separate catalogue objects', async () => {
    const { colocatedGroups } = await import('../src/sat/predict');
    const iss = OMM.find((o: any) => o.NORAD_CAT_ID === 25544);
    // Two docked modules with the identical element set, as CelesTrak publishes them.
    const docked = [iss, { ...iss, NORAD_CAT_ID: 25575, OBJECT_NAME: 'ISS (UNITY)' }, { ...iss, NORAD_CAT_ID: 26400, OBJECT_NAME: 'ISS (ZVEZDA)' }];
    const sats = parseElementText(JSON.stringify([...docked, ...OMM.filter((o: any) => o.NORAD_CAT_ID !== 25544)])).sats;
    const t = Date.UTC(2026, 10, 11, 9, 14);
    const { skip, members } = colocatedGroups(sats, t, t + 2 * 3_600_000);
    expect(skip.size).toBe(2);
    const repIdx = sats.findIndex((s) => s.norad === 25544);
    expect(members.get(repIdx)?.map((i) => sats[i].norad).sort()).toEqual([25575, 26400]);
  });
});

describe('pointing geometry helpers', () => {
  it('azimuth difference and angular separation', async () => {
    const { azimuthDifference, angularSeparation } = await import('../src/sat/fov');
    expect(azimuthDifference(350, 10)).toBe(20);
    expect(azimuthDifference(90, 270)).toBe(180);
    expect(azimuthDifference(240, 225)).toBe(15);
    expect(angularSeparation(0, 90, 123, 0)).toBeCloseTo(90, 9);
    expect(angularSeparation(10, 30, 10, 45)).toBeCloseTo(15, 9);
  });

  it('Sun at the start of the 2026-11-11 twilight band is in the WSW', async () => {
    const { sunAzAlt } = await import('../src/astro/sun');
    const { computeNight } = await import('../src/astro/schedule');
    const p = computeNight('2026-11-11', DEFAULT_SITE);
    const s = sunAzAlt(p.sun.descending[-12]!, DEFAULT_SITE);
    expect(s.altitude).toBeCloseTo(-12, 2);
    expect(s.azimuth).toBeGreaterThan(240);
    expect(s.azimuth).toBeLessThan(260);
  });
});
