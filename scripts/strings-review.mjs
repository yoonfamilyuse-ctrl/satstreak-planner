// Writes docs/strings-ko-review.md: every Korean UI string next to its English source, for wording review.
// Run: node scripts/strings-review.mjs   (regenerate after editing src/i18n/en.ts or ko.ts)
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
const out = mkdtempSync(join(tmpdir(), 'strings-'));
try {
  await build({ entryPoints: [join(root, 'src/i18n/en.ts'), join(root, 'src/i18n/ko.ts')], outdir: out, bundle: true, format: 'esm', platform: 'node', charset: 'utf8', logLevel: 'error' });
  const { en } = await import(pathToFileURL(join(out, 'en.js')).href);
  const { ko } = await import(pathToFileURL(join(out, 'ko.js')).href);

  /** A function's template literal (its body), so placeholders read as ${name}. */
  const show = (v) => {
    if (typeof v !== 'function') return String(v);
    const src = v.toString();
    const params = (src.match(/^\(?([^)=]*)\)?\s*=>/) ?? [])[1]?.trim() ?? '';
    const body = src.replace(/^[^=]*=>\s*/, '').trim();
    return `ƒ(${params}) → ${body}`;
  };
  const cell = (s) => s.replace(/\|/g, '\\|').replace(/\n\s*/g, ' ');

  const sections = { common: 'Shared', shell: 'Top bar, tabs, date and site', night: 'Night tab', log: 'Log tab', sats: 'Satellites tab', outlook: '14 nights' };
  const lines = [
    '# Korean UI strings for review',
    '',
    'Generated from `src/i18n/en.ts` and `src/i18n/ko.ts` by `node scripts/strings-review.mjs`. Edit the wording in',
    '`src/i18n/ko.ts`, then run the script again. Terms follow `docs/glossary.md`. Units, numbers, KST times and',
    'citations are deliberately not translated; exports (CSV/JSON, bundle README) stay in English.',
    '',
    'Entries marked ƒ are templates: `${…}` is filled in by the app (a number, time, date or name).',
    '',
  ];
  let count = 0;
  const walk = (e, k, path) => {
    for (const key of Object.keys(e)) {
      const ev = e[key];
      const kv = k?.[key];
      const p = path ? `${path}.${key}` : key;
      if (ev && typeof ev === 'object' && !Array.isArray(ev) && typeof ev !== 'function') {
        walk(ev, kv ?? {}, p);
        continue;
      }
      lines.push(`| \`${p}\` | ${cell(show(ev))} | ${cell(show(kv ?? '⚠ missing'))} |`);
      count++;
    }
    // Keys only Korean has (e.g. compass point names, which English keeps as N, NE, …).
    for (const key of Object.keys(k ?? {})) {
      if (key in e) continue;
      lines.push(`| \`${path}.${key}\` | ${cell(key)} | ${cell(show(k[key]))} |`);
      count++;
    }
  };
  for (const [sec, title] of Object.entries(sections)) {
    lines.push(`## ${title}`, '', '| Key | English | 한국어 |', '|---|---|---|');
    walk(en[sec], ko[sec], sec);
    lines.push('');
  }
  writeFileSync(join(root, 'docs/strings-ko-review.md'), lines.join('\n'));
  console.log(`docs/strings-ko-review.md: ${count} strings`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
