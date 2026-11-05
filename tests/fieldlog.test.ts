import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SITE } from '../src/config';
import { computeNight } from '../src/astro/schedule';
import {
  bandFrames,
  clockModel,
  clockOffset,
  effectiveInterval,
  formatKst,
  frameAtTime,
  frameStart,
  logToCsv,
  migrateLog,
  newLog,
  offsetAt,
  parseKst,
  toTrueTime,
  trueStartEnd,
} from '../src/log/fieldlog';
import { crc32, makeZip } from '../src/log/zip';

describe('KST parsing', () => {
  it('round-trips and handles after-midnight times', () => {
    expect(parseKst('2026-11-11T18:14:00')).toBe(Date.UTC(2026, 10, 11, 9, 14, 0));
    expect(parseKst('2026-11-12T00:30')).toBe(Date.UTC(2026, 10, 11, 15, 30, 0));
    expect(formatKst(Date.UTC(2026, 10, 11, 9, 14, 5))).toBe('2026-11-11T18:14:05');
    expect(parseKst('')).toBeNull();
    expect(parseKst('18:14')).toBeNull();
  });
});

describe('camera clock offset', () => {
  // Camera 7 s fast before, 8 s fast after (1 s drift over the night).
  const log = {
    ...newLog('2026-11-11'),
    clockBefore: [{ exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }],
    clockAfter: [{ exif: '2026-11-11T20:22:08', actual: '2026-11-11T20:22:00' }],
  };

  it('offset = EXIF − time.is', () => {
    expect(clockOffset(log.clockBefore[0])).toBe(7);
    expect(clockOffset(log.clockAfter[0])).toBe(8);
    expect(clockModel(log)).toMatchObject({ before: 7, after: 8, drift: 1 });
    expect(clockOffset({ exif: '2026-11-11T18:12:00', actual: '' })).toBeNull();
  });

  it('interpolates linearly between the checks and is constant outside', () => {
    const tb = parseKst(log.clockBefore[0].exif)!;
    const ta = parseKst(log.clockAfter[0].exif)!;
    expect(offsetAt(log, tb)).toBe(7);
    expect(offsetAt(log, ta)).toBe(8);
    expect(offsetAt(log, (tb + ta) / 2)).toBeCloseTo(7.5, 9);
    expect(offsetAt(log, tb - 3_600_000)).toBe(7);
    expect(offsetAt(log, ta + 3_600_000)).toBe(8);
    expect(offsetAt({ ...log, clockAfter: [{ exif: '', actual: '' }] }, ta)).toBe(7);
    expect(offsetAt(newLog('x'), ta)).toBeNull();
  });

  it('converts camera time to true time', () => {
    expect(toTrueTime(log, parseKst('2026-11-11T18:12:07')!)).toBe(parseKst('2026-11-11T18:12:00'));
  });

  it('averages several readings per side and reports the spread', () => {
    // Whole-second EXIF and screen: true offset 7.4 s shows up as 7 or 8 depending on the fraction of a second.
    const many = [7, 8, 7, 8, 7].map((d, i) => ({ exif: `2026-11-11T18:12:${String(10 + i * 3 + d).padStart(2, '0')}`, actual: `2026-11-11T18:12:${String(10 + i * 3).padStart(2, '0')}` }));
    const m = clockModel({ clockBefore: many, clockAfter: [{ exif: '', actual: '' }] });
    expect(m.before).toBeCloseTo(7.4, 9);
    expect(m.beforeDetail).toMatchObject({ n: 5, min: 7, max: 8 });
    expect(m.after).toBeNull();
  });

  it('migrates v1 logs (single reading) to v2 (list)', () => {
    const v1 = { ...newLog('2026-11-11'), schema: 1, clockBefore: { exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }, clockAfter: { exif: '', actual: '' } } as any;
    const v2 = migrateLog(v1);
    expect(v2.schema).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(v2.clockBefore)).toBe(true);
    expect(clockModel(v2).before).toBe(7);
  });
});

describe('frame numbers from the ACTUAL start (Stage 4 requirement)', () => {
  const plan = computeNight('2026-11-11', DEFAULT_SITE);

  it('a late start shifts every band-boundary frame', () => {
    // Scheduled start 18:14:00 KST; actually started at 18:17:07 by the camera clock, which is 7 s fast → 18:17:00 true.
    const log = {
      ...newLog('2026-11-11'),
      start: '2026-11-11T18:17:07',
      end: '2026-11-11T20:20:51',
      timeSource: { start: 'camera' as const, end: 'camera' as const },
      clockBefore: [{ exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }],
      camera: { ...newLog('x').camera, intervalS: 16, shotsTaken: 465 },
    };
    const { start, end, corrected } = trueStartEnd(log);
    expect(corrected).toBe(true);
    expect(start).toBe(parseKst('2026-11-11T18:17:00'));
    expect(end).toBe(parseKst('2026-11-11T20:20:44'));
    expect(effectiveInterval(start, end, 465)).toBeCloseTo(16.0, 2);

    const t12 = plan.sun.descending[-12]!.getTime(); // 18:19:00.3 KST
    // (18:19:00.3 − 18:17:00) = 120.3 s → frame 8 is being exposed (frames start every 16 s: 112 s = frame 8 start).
    expect(frameAtTime(start!, 16, t12)).toBe(8);
    // On plan (start 18:14:00.3) the twilight band would begin at frame 20. The difference is the late start.
    const scheduled = plan.timeline.find((i) => i.label.startsWith('Twilight band begins'))!.frame;
    expect(scheduled).toBe(20);

    const bf = bandFrames(start!, 16, 15, 465, plan.bands);
    const tw = bf.find((b) => b.key === 'twilight')!;
    const dk = bf.find((b) => b.key === 'dark')!;
    // Mid-exposure rule: first frame whose mid-exposure (start + 7.5 s) is at/after −12°, last one at/before −20°.
    const mid = (n: number) => frameStart(start!, 16, n) + 7500;
    const t20 = plan.sun.descending[-20]!.getTime();
    expect(mid(tw.firstFrame!)).toBeGreaterThanOrEqual(t12);
    expect(mid(tw.firstFrame! - 1)).toBeLessThan(t12);
    expect(mid(tw.lastFrame!)).toBeLessThanOrEqual(t20);
    expect(mid(tw.lastFrame! + 1)).toBeGreaterThan(t20);
    expect(dk.firstFrame!).toBeGreaterThan(tw.lastFrame!);
    expect(dk.lastFrame!).toBeLessThanOrEqual(465);
    // README example: 3 min late with the camera 7 s fast.
    expect([tw.firstFrame, tw.lastFrame, dk.firstFrame, dk.lastFrame]).toEqual([9, 161, 257, 445]);
  });

  it('an on-plan start gives identical Planned and Actual band frames (mid-exposure rule)', () => {
    const w = plan.window!;
    const actual = bandFrames(w.start.getTime(), 16, 15, w.shots, plan.bands);
    for (const b of plan.bands) {
      const a = actual.find((x) => x.key === b.key)!;
      expect([a.firstFrame, a.lastFrame], b.key).toEqual([b.plannedFirst, b.plannedLast]);
      expect(b.frames).toBe(b.plannedLast! - b.plannedFirst! + 1);
    }
    // Frame 173 starts 18:59:52.3; its mid-exposure 18:59:59.8 is after −20° (18:59:57.x), so it is in the gap.
    expect([plan.bands[0].plannedFirst, plan.bands[0].plannedLast]).toEqual([20, 172]);
    expect([plan.bands[1].plannedFirst, plan.bands[1].plannedLast]).toEqual([268, 456]);
    // The timeline's band rows show the same frames.
    const tl = (label: string) => plan.timeline.find((i) => i.label.startsWith(label))!.frame;
    expect([tl('Twilight band begins'), tl('Twilight band ends'), tl('Dark band begins'), tl('Dark band ends')]).toEqual([
      plan.bands[0].plannedFirst,
      plan.bands[0].plannedLast,
      plan.bands[1].plannedFirst,
      plan.bands[1].plannedLast,
    ]);
  });

  it('every frame is in the band that contains its mid-exposure Sun altitude', async () => {
    const { sunAltitude } = await import('../src/astro/sun');
    const { bandOf } = await import('../src/sat/predict');
    const { bandAtTime, midExposure } = await import('../src/astro/frames');
    // A late start with a non-default exposure/interval, so frames do not line up with the plan.
    const t0 = plan.window!.start.getTime() + 187_000;
    for (const [interval, exposure] of [[16, 15], [31, 30], [9, 8]] as const) {
      const shots = Math.floor((plan.window!.end.getTime() - t0) / 1000 / interval);
      const bf = bandFrames(t0, interval, exposure, shots, plan.bands);
      for (let n = 1; n <= shots; n++) {
        const m = midExposure(t0, interval, exposure, n);
        const byAlt = bandOf(sunAltitude(new Date(m), DEFAULT_SITE));
        const byRange = bf.find((b) => b.firstFrame !== null && n >= b.firstFrame && n <= b.lastFrame!)?.key ?? null;
        expect(bandAtTime(m, plan.bands), `frame ${n}, ${exposure}/${interval} s`).toBe(byAlt);
        if (byAlt === 'twilight' || byAlt === 'dark') expect(byRange, `frame ${n}`).toBe(byAlt);
        else expect(byRange, `frame ${n}`).toBeNull();
      }
    }
  });

  it('times read from a true clock are not corrected', () => {
    const log = { ...newLog('2026-11-11'), start: '2026-11-11T18:17:00', timeSource: { start: 'true' as const, end: 'true' as const }, clockBefore: [{ exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }] };
    expect(trueStartEnd(log).start).toBe(parseKst('2026-11-11T18:17:00'));
    expect(trueStartEnd(log).corrected).toBe(false);
  });

  it('each time has its own source: a phone-clock start is not corrected, a camera-clock end is', () => {
    const log = {
      ...newLog('2026-11-11'),
      start: '2026-11-11T18:17:00', // filled with "Now" from the phone
      end: '2026-11-11T20:20:51', // read from the last frame's EXIF
      timeSource: { start: 'phone' as const, end: 'camera' as const },
      clockBefore: [{ exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }],
    };
    const r = trueStartEnd(log);
    expect(r.start).toBe(parseKst('2026-11-11T18:17:00'));
    expect(r.end).toBe(parseKst('2026-11-11T20:20:44'));
    expect(r.startCorrected).toBe(false);
    expect(r.endCorrected).toBe(true);
  });

  it('migrates a v2 single time source to one source per time', () => {
    const v2 = { ...newLog('2026-11-11'), schema: 2, timeSource: 'true' } as any;
    const v3 = migrateLog(v2);
    expect(v3.schema).toBe(3);
    expect(v3.timeSource).toEqual({ start: 'true', end: 'true' });
    expect(migrateLog({ ...newLog('2026-11-11'), schema: 2, timeSource: undefined } as any).timeSource).toEqual({ start: 'camera', end: 'camera' });
  });

  it('writes one time-source column per time to the CSV', () => {
    const log = { ...newLog('2026-11-11'), timeSource: { start: 'phone' as const, end: 'camera' as const } };
    const [head, row] = logToCsv(log, {}).trim().split('\n').filter((l) => !l.startsWith('#')).map((l) => l.split(','));
    const col = (k: string) => row[head.indexOf(k)];
    expect(col('start_time_source')).toBe('phone');
    expect(col('end_time_source')).toBe('camera');
  });

  it('frameAtTime edges', () => {
    expect(frameAtTime(0, 16, -1)).toBeNull();
    expect(frameAtTime(0, 16, 0)).toBe(1);
    expect(frameAtTime(0, 16, 15_999)).toBe(1);
    expect(frameAtTime(0, 16, 16_000)).toBe(2);
    expect(frameAtTime(0, 16, 16_000 * 10, 10)).toBeNull();
  });
});

describe('export', () => {
  it('CSV has one header row and one value row with derived fields', () => {
    const csv = logToCsv({ ...newLog('2026-11-11'), notes: 'plane at 18:40, "bright"' }, { true_start_kst: '2026-11-11T18:17:00' });
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    // The comment line states the band rule (read with e.g. pandas.read_csv(..., comment='#')).
    expect(lines[0]).toMatch(/^# .*frame start \+ exposure\/2/);
    expect(lines[1]).toContain('true_start_kst');
    expect(lines[2]).toContain('"plane at 18:40, ""bright"""');
  });

  it('CRC-32 of "123456789" is CBF43926', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('ZIP is readable by a standard unzip tool', () => {
    const zip = makeZip([
      { name: 'fieldlog_2026-11-11.csv', data: 'a,b\n1,2\n' },
      { name: 'elements_2026-11-11.tle.txt', data: 'ISS (ZARYA)\n1 25544U...\n' },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const p = join(dir, 'test.zip');
    writeFileSync(p, zip);
    let out = '';
    try {
      out = execFileSync('unzip', ['-t', p], { encoding: 'utf8' });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(out).toContain('No errors detected');
  });
});
