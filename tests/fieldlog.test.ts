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
    expect(v2.schema).toBe(2);
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
      timeSource: 'camera' as const,
      clockBefore: [{ exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }],
      camera: { ...newLog('x').camera, intervalS: 16, shotsTaken: 465 },
    };
    const { start, end, corrected } = trueStartEnd(log);
    expect(corrected).toBe(true);
    expect(start).toBe(parseKst('2026-11-11T18:17:00'));
    expect(end).toBe(parseKst('2026-11-11T20:20:44'));
    expect(effectiveInterval(start, end, 465)).toBeCloseTo(16.0, 2);

    const t12 = plan.sun.descending[-12]!.getTime(); // 18:19:00.3 KST
    // (18:19:00.3 − 18:17:00) = 120.3 s → frame 8 (frames start every 16 s: 112 s = frame 8 start).
    expect(frameAtTime(start!, 16, t12)).toBe(8);
    // The scheduled plan said frame 19 for the same moment (start 18:14:00). The difference is the late start.
    const scheduled = plan.timeline.find((i) => i.label.startsWith('Twilight band begins'))!.frame;
    expect(scheduled).toBe(19);

    const bf = bandFrames(start!, 16, 465, plan.bands);
    const tw = bf.find((b) => b.key === 'twilight')!;
    const dk = bf.find((b) => b.key === 'dark')!;
    // First frame starting at/after the −12° moment, last frame starting before the −20° moment.
    expect(frameStart(start!, 16, tw.firstFrame!)).toBeGreaterThanOrEqual(t12);
    expect(frameStart(start!, 16, tw.firstFrame! - 1)).toBeLessThan(t12);
    expect(frameStart(start!, 16, tw.lastFrame!)).toBeLessThan(plan.sun.descending[-20]!.getTime());
    expect(frameStart(start!, 16, tw.lastFrame! + 1)).toBeGreaterThanOrEqual(plan.sun.descending[-20]!.getTime());
    expect(dk.firstFrame!).toBeGreaterThan(tw.lastFrame!);
    expect(dk.lastFrame!).toBeLessThanOrEqual(465);
  });

  it('times read from a true clock are not corrected', () => {
    const log = { ...newLog('2026-11-11'), start: '2026-11-11T18:17:00', timeSource: 'true' as const, clockBefore: [{ exif: '2026-11-11T18:12:07', actual: '2026-11-11T18:12:00' }] };
    expect(trueStartEnd(log).start).toBe(parseKst('2026-11-11T18:17:00'));
    expect(trueStartEnd(log).corrected).toBe(false);
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
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('true_start_kst');
    expect(lines[1]).toContain('"plane at 18:40, ""bright"""');
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
