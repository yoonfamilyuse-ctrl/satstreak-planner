import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { propagate, twoline2satrec } from 'satellite.js';
import { DEFAULT_SITE } from '../src/config';
import { compass } from '../src/astro/moon';
import { decodeAlpha5, ommArrayToTleText, ommToTle, parseElementText, parseTle, tleChecksum, tleExp } from '../src/sat/elements';
import { DEFAULT_CAMERA, fieldOfView, gnomonic, inFov, inverseGnomonic, makeFov } from '../src/sat/fov';
import { findPasses, frameNights, isSunlit, predictCrossings, R_EARTH_KM } from '../src/sat/predict';
import { computeNight } from '../src/astro/schedule';
import { addDays } from '../src/time';

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

  it('ISS check for 2026-11-11: enters the S/60° frame at 18:48:18 and leaves at 18:49:53 KST', () => {
    const sats = parseElementText(FIXTURE).sats;
    const r = predictCrossings(sats, {
      start: Date.UTC(2026, 10, 11, 9, 14, 0),
      end: Date.UTC(2026, 10, 11, 11, 20, 40),
      stepS: 10,
      site: DEFAULT_SITE,
      camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 },
      pointing: [{ ...DEFAULT_CAMERA, azimuth: 270, altitude: 45 }],
    });
    const iss = r.crossings.find((c) => c.norad === 25544)!;
    expect(Math.abs(iss.entry - Date.UTC(2026, 10, 11, 9, 48, 18)) / 1000).toBeLessThan(1);
    expect(Math.abs(iss.exit - Date.UTC(2026, 10, 11, 9, 49, 53)) / 1000).toBeLessThan(1);
    expect(iss.maxAlt).toBeGreaterThan(69);
    expect(iss.m1000! + iss.magRel).toBeLessThan(-3); // bright
    // W/45° does not see it.
    expect(r.pointing[0].runs.some((x) => x.norad === 25544)).toBe(false);
  });
});

describe('ISS frame check over several nights', () => {
  const iss = parseElementText(FIXTURE).sats.find((x) => x.norad === 25544)!;
  const nights = Array.from({ length: 3 }, (_, i) => addDays('2026-11-10', i)).map((date) => {
    const w = computeNight(date, DEFAULT_SITE).window!;
    return { date, start: w.start.getTime(), end: w.end.getTime() };
  });

  it('gives the same 2026-11-11 crossing as the full prediction (S/60°, 18:48:18–18:49:53 KST)', () => {
    const r = frameNights(iss, nights, DEFAULT_SITE, { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 });
    expect(r.map((n) => n.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    const c = r[1].crossings;
    expect(c).toHaveLength(1);
    expect(Math.abs(c[0].entry - Date.UTC(2026, 10, 11, 9, 48, 18)) / 1000).toBeLessThan(1);
    expect(Math.abs(c[0].exit - Date.UTC(2026, 10, 11, 9, 49, 53)) / 1000).toBeLessThan(1);
    expect(r[1].passes.length).toBeGreaterThan(0);
  });

  it('reports a pass with no crossing when the frame points away (W/45° on 2026-11-11)', () => {
    const r = frameNights(iss, nights, DEFAULT_SITE, { ...DEFAULT_CAMERA, azimuth: 270, altitude: 45 });
    expect(r[1].crossings).toEqual([]);
    expect(r[1].passes.length).toBeGreaterThan(0);
  });

  it('matches predictCrossings night by night', () => {
    const cam = { ...DEFAULT_CAMERA, azimuth: 135, altitude: 50 };
    const r = frameNights(iss, nights, DEFAULT_SITE, cam);
    for (const [i, n] of nights.entries()) {
      const full = predictCrossings([iss], { ...n, stepS: 10, site: DEFAULT_SITE, camera: cam, pointing: [] });
      expect(r[i].crossings.map((c) => [c.entry, c.exit])).toEqual(full.crossings.map((c) => [c.entry, c.exit]));
    }
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
    expect(intrinsicFor({ norad: 1, name: 'ONEWEB-0012', cospar: '2019-010A' })?.key).toBe('OneWeb');
    expect(intrinsicFor({ norad: 1, name: 'ONEWEB-0012', cospar: '2019-010A' })?.key).toBe('OneWeb');
    expect(intrinsicFor({ norad: 1, name: 'COSMOS 2251' })).toBeNull();
    const big = parseElementText(FIXTURE).sats.find((s) => s.norad === 100001)!; // STARLINK-38128
    expect(big.starlinkVersion).toBe('mini-opt');
    expect(big.intrinsic?.key).toBe('SL-Mini-550 (for Mini-Opt)');
    expect(big.intrinsic?.flag).toMatch(/no published value/);
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
    const { skip, members } = colocatedGroups(sats);
    expect(skip.size).toBe(2);
    const repIdx = sats.findIndex((s) => s.norad === 25544);
    expect(members.get(repIdx)?.map((i) => sats[i].norad).sort()).toEqual([25575, 26400]);
  });

  /**
   * A freshly deployed train: same orbit, objects spaced along track. Distinct element sets (here the mean
   * anomaly differs by 0.005°, ≈ 0.6 km at ISS altitude), so each is its own object and its own streak.
   */
  const iss = OMM.find((o: any) => o.NORAD_CAT_ID === 25544);
  const train = [
    { ...iss, NORAD_CAT_ID: 90001, OBJECT_NAME: 'TRAIN-1' },
    { ...iss, NORAD_CAT_ID: 90002, OBJECT_NAME: 'TRAIN-2', MEAN_ANOMALY: iss.MEAN_ANOMALY + 0.005 },
    { ...iss, NORAD_CAT_ID: 90003, OBJECT_NAME: 'TRAIN-3', MEAN_ANOMALY: iss.MEAN_ANOMALY + 0.01 },
    // ≈ 6 km behind: same pass, but not close enough to overlap as a train.
    { ...iss, NORAD_CAT_ID: 90004, OBJECT_NAME: 'TRAIN-4', MEAN_ANOMALY: iss.MEAN_ANOMALY + 0.05 },
  ];
  const window = { start: Date.UTC(2026, 10, 11, 9, 14, 0), end: Date.UTC(2026, 10, 11, 11, 20, 40), stepS: 10, site: DEFAULT_SITE, pointing: [] };

  it('does not merge a launch train: objects within 2 km with distinct element sets are counted separately', async () => {
    const { colocatedGroups } = await import('../src/sat/predict');
    const sats = parseElementText(JSON.stringify(train)).sats;
    expect(colocatedGroups(sats).skip.size).toBe(0);
    // The ISS S/60° crossing of 2026-11-11 (see above): every train object crosses the frame.
    const r = predictCrossings(sats, { ...window, camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 } });
    expect(r.mergedObjects).toBe(0);
    expect(r.crossings.map((c) => c.norad).sort()).toEqual([90001, 90002, 90003, 90004]);
  });

  /** Visiting vehicles with their own element set (CelesTrak gives them an older one than the station's). */
  const visiting = (station: any, norad = station.NORAD_CAT_ID, name = station.OBJECT_NAME) => [
    { ...station, NORAD_CAT_ID: norad, OBJECT_NAME: name },
    { ...station, NORAD_CAT_ID: 90100, OBJECT_NAME: 'PROGRESS-TEST', MEAN_ANOMALY: station.MEAN_ANOMALY + 0.005 }, // ≈ 0.6 km
    { ...station, NORAD_CAT_ID: 90101, OBJECT_NAME: 'SOYUZ-TEST', MEAN_ANOMALY: station.MEAN_ANOMALY + 0.005 }, // same set as 90100
    { ...station, NORAD_CAT_ID: 90102, OBJECT_NAME: 'FREE-FLYER', MEAN_ANOMALY: station.MEAN_ANOMALY + 0.05 }, // ≈ 6 km: not part of it
  ];

  for (const [norad, name] of [[25544, 'ISS (ZARYA)'], [48274, 'CSS (TIANHE)']] as const) {
    it(`merges visiting vehicles that stay within 2 km of the crewed station ${name} while in frame`, () => {
      const sats = parseElementText(JSON.stringify(visiting(iss, norad, name))).sats;
      const r = predictCrossings(sats, { ...window, camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 }, pointing: [{ ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 }] });
      expect(r.crossings.map((c) => c.norad).sort()).toEqual([norad, 90102]);
      const st = r.crossings.find((c) => c.norad === norad)!;
      expect(st.merged).toEqual([
        { norad: 90100, name: 'PROGRESS-TEST', how: 'station' },
        { norad: 90101, name: 'SOYUZ-TEST', how: 'station' },
      ]);
      expect(r.stationMerged).toBe(2);
      expect(st.train).toEqual([]); // the free flyer is ≈ 6 km away
      // The pointing comparison counts the station once too.
      expect(r.pointing[0].runs.map((x) => x.norad).sort()).toEqual([norad, 90102]);
      expect(r.tracks.map((t) => t.norad).sort()).toEqual([norad, 90102]);
    });
  }

  it('does not merge by distance around objects that are not crewed stations', () => {
    // The same geometry with no station in the set: every object is its own crossing; the close ones are a train.
    const sats = parseElementText(JSON.stringify(visiting(iss, 90099, 'NOT-A-STATION'))).sats;
    const r = predictCrossings(sats, { ...window, camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 } });
    expect(r.stationMerged).toBe(0);
    expect(r.crossings.map((c) => c.norad).sort()).toEqual([90099, 90100, 90102]); // 90101 shares 90100's elements
    expect(r.crossings.find((c) => c.norad === 90099)!.train.map((x) => x.norad)).toEqual([90100]);
  });

  it('train check skips far-apart pairs instead of sampling every second (long GEO/MEO crossings)', async () => {
    const { flagTrains } = await import('../src/sat/predict');
    const sats = parseElementText(FIXTURE).sats;
    const byNorad = new Map(sats.map((s) => [s.norad, s]));
    // Two unrelated objects whose (hypothetical) crossings overlap for the whole 2-h window, as a GEO object does.
    const c = (norad: number) => ({ norad, name: String(norad), entry: window.start, exit: window.start + 2 * 3_600_000, train: [] as any[] }) as any;
    const cs = [c(25544), c(900)];
    const { evaluations } = flagTrains(cs, byNorad);
    expect(cs[0].train).toEqual([]);
    expect(evaluations).toBeLessThan(1000); // every-second sampling took 7201
  });

  it('flags crossings within 2 km of another crossing object as a train', () => {
    const sats = parseElementText(JSON.stringify(train)).sats;
    const r = predictCrossings(sats, { ...window, camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 } });
    const by = (n: number) => r.crossings.find((c) => c.norad === n)!;
    expect(by(90001).train.map((x) => x.norad).sort()).toEqual([90002, 90003]);
    expect(by(90002).train.map((x) => x.norad).sort()).toEqual([90001, 90003]);
    expect(by(90003).train.map((x) => x.norad).sort()).toEqual([90001, 90002]);
    expect(by(90004).train).toEqual([]);
    for (const x of by(90002).train) expect(x.minKm).toBeLessThan(2);
    // The real sample set has no trains.
    const real = predictCrossings(parseElementText(FIXTURE).sats, { ...window, camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 } });
    expect(real.crossings.every((c) => c.train.length === 0)).toBe(true);
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

describe('Starlink versions from GCAT (per satellite)', () => {
  it('classifies by GCAT bus / payload name and flags what is uncertain', async () => {
    const { starlinkVersion } = await import('../src/sat/starlink-versions');
    const { intrinsicFor, starlinkVersionOf } = await import('../src/sat/magnitude');
    expect(starlinkVersion(44235)).toBe('v0.9'); // Starlink V0.9-01, 2019-029A
    expect(starlinkVersion(43216)).toBeNull(); // Tintin A: not named "Starlink" in GCAT
    expect(starlinkVersion(25544)).toBeNull();
    // A V1.0 launch L1 satellite is an Original; L8+ are VisorSats (McDowell's grouping).
    const parse = (norad: number, name: string) => intrinsicFor({ norad, name });
    const firstOriginal = [...Array(2000).keys()].map((i) => 44700 + i).find((n) => starlinkVersion(n) === 'v1.0-original')!;
    const firstVisor = [...Array(5000).keys()].map((i) => 45000 + i).find((n) => starlinkVersion(n) === 'visorsat')!;
    expect(parse(firstOriginal, 'STARLINK-X')?.key).toBe('SL-V1.0');
    expect(parse(firstVisor, 'STARLINK-X')?.key).toBe('SL-VisorSat');
    // Newer than the GCAT release: unknown, except the [DTC] name suffix.
    expect(starlinkVersionOf({ norad: 999999, name: 'STARLINK-99999' })).toBe('not-in-gcat');
    expect(parse(999999, 'STARLINK-99999')).toBeNull();
    expect(parse(999999, 'STARLINK-99999 [DTC]')?.flag).toMatch(/not in GCAT/);
    expect(starlinkVersionOf({ norad: 25544, name: 'ISS (ZARYA)' })).toBeNull();
  });
  it('classifies Starlinks by catalog number when the element set has no names (2-line TLE)', async () => {
    const { starlinkVersion } = await import('../src/sat/starlink-versions');
    const named = parseElementText(ommArrayToTleText(OMM).text).sats;
    // Same elements without the name lines: parseTle names each object by its catalog number.
    const twoLine = ommArrayToTleText(OMM).text.split('\n').filter((l) => /^[12] /.test(l)).join('\n');
    const bare = parseElementText(twoLine).sats;
    expect(bare.length).toBe(named.length);
    const inGcat = named.filter((s) => starlinkVersion(s.norad));
    expect(inGcat.length).toBeGreaterThanOrEqual(5);
    for (const s of inGcat) {
      const b = bare.find((x) => x.norad === s.norad)!;
      expect(b.name, `${s.norad} has no name`).not.toMatch(/STARLINK/);
      expect(b.starlinkVersion, `${s.norad} version`).toBe(s.starlinkVersion);
      expect(b.intrinsic?.key, `${s.norad} magnitude source`).toBe(s.intrinsic?.key);
    }
    expect(inGcat.some((s) => s.intrinsic)).toBe(true);
  });
});

describe('trailing-loss models (Peak: Hainaut & Williams 2020; Matched filter: Jones et al. 2018)', () => {
  it('Peak loss = 2.5 log10(L/FWHM)', async () => {
    const { peakLoss, pixelScaleDeg, trailLengthPx } = await import('../src/sat/detection');
    expect(peakLoss(2, 2)).toBe(0);
    expect(peakLoss(1, 2)).toBe(0);
    expect(peakLoss(20, 2)).toBeCloseTo(2.5, 12);
    expect(peakLoss(200, 2)).toBeCloseTo(5, 12);
    const ps = pixelScaleDeg(35.9, 6000, 28);
    expect(ps).toBeCloseTo(0.01224, 5);
    expect(trailLengthPx(0.384, 15, ps)).toBeCloseTo(470, -1);
  });

  it('Matched-filter loss reproduces Jones et al. (2018) Eq. 4 and their quoted fiducial value', async () => {
    const { matchedLoss } = await import('../src/sat/detection');
    // Their fiducial case: v = 1 deg/day, T = 30 s, theta = 0.7" -> x = vT/(24 theta) = 1.786; "SNR loss is ~0.3 mag".
    const x = (1 * 30) / (24 * 0.7);
    expect(matchedLoss(x, 1)).toBeCloseTo(0.287, 2);
    expect(matchedLoss(x, 1)).toBeGreaterThan(0.25);
    expect(matchedLoss(x, 1)).toBeLessThan(0.35);
    // x = L/FWHM: the same trail in px with FWHM 2 px gives the same loss.
    expect(matchedLoss(2 * x, 2)).toBeCloseTo(matchedLoss(x, 1), 12);
    // Long trails: slope 1.25 per decade, i.e. ~half the Peak model's 2.5.
    expect(matchedLoss(2000, 2) - matchedLoss(200, 2)).toBeCloseTo(1.25, 1);
    expect(matchedLoss(0, 2)).toBe(0);
  });

  it('both models use the same samples; detectable if ANY sample passes', async () => {
    const { evaluateDetection, peakLoss, matchedLoss, pixelScaleDeg, trailLengthPx } = await import('../src/sat/detection');
    const s = { starLimit: 9, fixedLimit: 6, fwhmPx: 2, pixelsAcross: 6000, sensorWidthMm: 35.9, focalLengthMm: 28, exposureS: 15 };
    const ps = pixelScaleDeg(35.9, 6000, 28);
    // Two samples: bright but fast, fainter but slow.
    const samples: [number, number][] = [
      [0, 0.8],
      [0.5, 0.2],
    ];
    const d = evaluateDetection({ m1000: 4, samples }, null, s);
    expect(d.mag).toBe(4);
    expect(d.trailPx).toBeCloseTo(trailLengthPx(0.8, 15, ps), 9);
    const margin = (loss: (L: number, f: number) => number) =>
      Math.max(...samples.map(([rel, w]) => 9 - loss(trailLengthPx(w, 15, ps), 2) - (4 + rel)));
    expect(d.peak.detectable).toBe(margin(peakLoss) >= 0);
    expect(d.matched.detectable).toBe(margin(matchedLoss) >= 0);
    expect(d.matched.limit!).toBeGreaterThan(d.peak.limit!);
    expect(d.fixed).toEqual({ limit: 6, detectable: true });
    expect(evaluateDetection({ m1000: null, samples }, null, s).peak.detectable).toBeNull();
    expect(evaluateDetection({ m1000: null, samples }, 4, s).mag).toBe(4);
  });

  it('ISS on 2026-11-11 at S/60°: apparent angular speed about 1°/s, samples stored for every in-frame step', () => {
    const sats = parseElementText(FIXTURE).sats;
    const r = predictCrossings(sats, {
      start: Date.UTC(2026, 10, 11, 9, 40),
      end: Date.UTC(2026, 10, 11, 9, 55),
      stepS: 10,
      site: DEFAULT_SITE,
      camera: { ...DEFAULT_CAMERA, azimuth: 180, altitude: 60 },
      pointing: [],
    });
    const iss = r.crossings.find((c) => c.norad === 25544)!;
    expect(iss.samples.length).toBeGreaterThanOrEqual(9);
    const omega = Math.max(...iss.samples.map((x) => x[1]));
    expect(omega).toBeGreaterThan(0.6);
    expect(omega).toBeLessThan(1.3);
    expect(Math.min(...iss.samples.map((x) => x[0]))).toBeCloseTo(iss.magRel, 2);
  });
});
