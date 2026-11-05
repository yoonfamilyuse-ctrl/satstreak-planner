#!/usr/bin/env python3
"""
Generate src/sat/starlink-versions.ts from GCAT (J. McDowell, planet4589.org/space/gcat).

Inputs (download once, then run):
  https://planet4589.org/space/gcat/tsv/cat/satcat.tsv        (catalog numbers < 100000)
  https://planet4589.org/space/gcat/tsv/cat/satcat100k.tsv    (catalog numbers >= 100000)
Usage:
  python3 scripts/gen-starlink-versions.py satcat.tsv satcat100k.tsv > src/sat/starlink-versions.ts

Classification of Starlink payloads (Type 'P', Name 'Starlink*'):
  Bus 'Starlink V2MD'                        -> dtc        (V2 Mini Direct-to-Cell)
  Bus 'Starlink V2MO'                        -> mini-opt   (V2 Mini Optimized)
  Bus 'Starlink V2M'                         -> mini       (V2 Mini)
  Bus 'Starlink V3'                          -> v3
  Bus 'Starlink', PLName 'Starlink V0.9-*'   -> v0.9
  Bus 'Starlink', PLName 'Starlink V1.0-Ln-*', n <= 7 -> v1.0-original
                                               n >= 8 -> visorsat
      (McDowell, Starlink Statistics, planet4589.org/space/con/star/stats.html: "Group 1 Early Launches 2-8
       (V1.0 L1-7)"; "Group 1 Visorsat Launches 9-17 (V1.0 L8-16)"; "Group 1 Visorsat Launches 19+ (V1.0 L17+)")
  Bus 'Starlink', PLName 'Starlink Group g-*', g in 2..5 -> v1.5
      (same page: "Starlink Group 2/3/4/5 V1.5 Launches")
  anything else                              -> uncertain  (e.g. the Transporter rideshare 'TSP1/TSP2' satellites,
                                                            which the statistics page lists without a version)
"""
import re
import sys

CLASSES = ['v0.9', 'v1.0-original', 'visorsat', 'v1.5', 'mini', 'mini-opt', 'dtc', 'v3', 'uncertain']


def rows(fn):
    with open(fn, encoding='utf-8') as f:
        hdr = f.readline().lstrip('#').rstrip('\n').split('\t')
        updated = ''
        for line in f:
            if line.startswith('#'):
                m = re.search(r'Updated (.*)', line)
                if m:
                    updated = m.group(1).strip()
                continue
            yield updated, dict(zip(hdr, [c.strip() for c in line.rstrip('\n').split('\t')]))


def classify(r):
    bus, pl = r['Bus'], r['PLName']
    if bus == 'Starlink V2MD':
        return 'dtc'
    if bus == 'Starlink V2MO':
        return 'mini-opt'
    if bus == 'Starlink V2M':
        return 'mini'
    if bus == 'Starlink V3':
        return 'v3'
    if bus == 'Starlink':
        if pl.startswith('Starlink V0.9'):
            return 'v0.9'
        m = re.match(r'Starlink V1\.0-L(\d+)', pl)
        if m:
            return 'v1.0-original' if int(m.group(1)) <= 7 else 'visorsat'
        m = re.match(r'Starlink Group (\d+)-', pl)
        if m and m.group(1) in ('2', '3', '4', '5'):
            return 'v1.5'
    return 'uncertain'


def main():
    cls = {}
    updates = set()
    for fn in sys.argv[1:]:
        for upd, r in rows(fn):
            if upd:
                updates.add(upd)
            if not (r.get('Name', '').startswith('Starlink') and r.get('Type', '').startswith('P') and r.get('Satcat', '').isdigit()):
                continue
            cls[int(r['Satcat'])] = classify(r)
    runs = []
    for n in sorted(cls):
        c = CLASSES.index(cls[n])
        if runs and runs[-1][2] == c and runs[-1][0] + runs[-1][1] == n:
            runs[-1][1] += 1
        else:
            runs.append([n, 1, c])
    counts = {c: sum(1 for v in cls.values() if v == c) for c in CLASSES}
    print('/**')
    print(' * Starlink version of each catalogued Starlink satellite (by NORAD catalog number). GENERATED FILE.')
    print(' * Generator: scripts/gen-starlink-versions.py (classification rules documented there).')
    print(' *')
    print(' * Source: McDowell, J. C., 2020. General Catalog of Artificial Space Objects (GCAT), Release 1.8.8 (2026 Sep 3),')
    print(f' * data update "{"; ".join(sorted(updates))}", https://planet4589.org/space/gcat (CC-BY-4.0):')
    print(' * satcat.tsv + satcat100k.tsv, columns Bus and PLName; V1.0/VisorSat/V1.5 grouping from McDowell, Starlink')
    print(' * Statistics, https://planet4589.org/space/con/star/stats.html (accessed 2026-11-05).')
    print(f' * Counts: {", ".join(f"{k} {v}" for k, v in counts.items())}.')
    print(' * Satellites launched after this data update are not listed (version unknown).')
    print(' */')
    print(f'export const STARLINK_CLASSES = {CLASSES!r} as const;'.replace("'", "'"))
    print('export type StarlinkVersion = (typeof STARLINK_CLASSES)[number];')
    print('/** Runs of consecutive catalog numbers with the same version: [first NORAD, count, index into STARLINK_CLASSES]. */')
    print('const RUNS: [number, number, number][] = [')
    line = '  '
    for r in runs:
        item = f'[{r[0]},{r[1]},{r[2]}],'
        if len(line) + len(item) > 116:
            print(line.rstrip())
            line = '  '
        line += item
    print(line.rstrip())
    print('];')
    print('''
/** Version for a NORAD catalog number, or null if it is not a Starlink in this GCAT release. Binary search. */
export function starlinkVersion(norad: number): StarlinkVersion | null {
  let lo = 0;
  let hi = RUNS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [first, count, c] = RUNS[mid];
    if (norad < first) hi = mid - 1;
    else if (norad >= first + count) lo = mid + 1;
    else return STARLINK_CLASSES[c];
  }
  return null;
}''')


main()
