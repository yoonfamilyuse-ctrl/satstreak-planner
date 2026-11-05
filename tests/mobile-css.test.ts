import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** Top-level rules as [selector, body] (media blocks flattened; enough for these checks). */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
const px = (body: string, prop: RegExp) => {
  const m = body.match(prop);
  return m ? Number(m[1]) : null;
};

describe('iOS Safari: native feel', () => {
  it('no text field is set below 16 px (iOS zooms the page into smaller inputs)', () => {
    const bad = rules
      .filter(([sel]) => /(^|[\s,>])(input|textarea|select)\b/.test(sel) && !/checkbox/.test(sel))
      .map(([sel, body]) => [sel, px(body, /font-size:\s*([\d.]+)px/) ?? px(body, /font:\s*(?:\d+\s+)?([\d.]+)px/)] as const)
      .filter(([, size]) => size !== null && size < 16);
    expect(bad).toEqual([]);
  });

  it('never disables zoom, and lets the page use the safe areas', () => {
    const vp = html.match(/name="viewport" content="([^"]+)"/)![1];
    expect(vp).toContain('viewport-fit=cover');
    expect(vp).not.toMatch(/user-scalable=no|maximum-scale=1/);
    expect(css).toMatch(/\.topbar\s*\{[^}]*env\(safe-area-inset-top\)/);
  });

  it('no tap flash, and any hover style is gated to devices that can hover', () => {
    expect(css).toMatch(/html\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/);
    const ungated = css.split(/@media[^{]*\(hover:\s*hover\)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/).join('').match(/:hover/g) ?? [];
    expect(ungated).toEqual([]);
  });

  it('supports Safari page zoom 200% (about 195 px wide): tabs scroll, Tonight wraps, tables and grids stack', () => {
    const narrow = css.match(/@media \(max-width: 300px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(narrow).toMatch(/\.tabs \{[^}]*overflow-x: auto/);
    expect(narrow).toMatch(/\.date-row #today \{[^}]*grid-column: 1 \/ -1/);
    expect(narrow).toMatch(/\.now \{[^}]*grid-template-columns: 1fr/);
    expect(narrow).toMatch(/\.block table[^{]*\{[^}]*overflow-x: auto/);
    expect(narrow).toMatch(/\.cam-grid input[^{]*\{[^}]*min-width: 0/);
  });

  it('disclosure chevrons never shrink next to a long label (break-ui #3)', () => {
    for (const sel of ['details.site summary::after', 'details.how summary::after']) {
      const body = rules.find(([s]) => s === sel)?.[1] ?? '';
      expect(body, sel).toMatch(/flex:\s*none/);
    }
  });

  it('the 14-night rating never wraps ("No window", break-ui #5)', () => {
    expect(rules.find(([s]) => s === '.ol-cloud .ol-rating')?.[1]).toMatch(/white-space:\s*nowrap/);
  });

  it('the date control drops "tap to pick" below 360 px so it fits on two lines (break-ui #6)', () => {
    expect(css).toMatch(/@media \(max-width: 359px\) \{ \.tap-hint \{ display: none; \} \}/);
    expect(readFileSync(join(ROOT, 'src/main.ts'), 'utf8')).toContain('<span class="tap-hint" data-t="tapHint"></span>');
    expect(readFileSync(join(ROOT, 'src/i18n/en.ts'), 'utf8')).toContain("tapHint: ' · tap to pick'");
  });

  it('night 14-night bars: #300000 window on a darker #120000 track, still pure red (break-ui #7)', () => {
    expect(css).toMatch(/:root\[data-theme='night'\] \.ol-bar \{ background: #120000; \}/);
    expect(css).toMatch(/:root\[data-theme='night'\] \.ol-film[^{]*\{ background: #300000; \}/);
  });

  it('placeholder text uses the muted token (the browser default grey leaked at night)', () => {
    expect(rules.find(([s]) => s === '::placeholder')?.[1]).toMatch(/color:\s*var\(--muted\)/);
  });

  it('the app name never breaks inside a word, and takes its own line below 300 px (Korean break-ui)', () => {
    expect(css).toMatch(/\.topbar h1 \{ overflow-wrap: normal; word-break: normal;/);
    const narrow = [...css.matchAll(/@media \(max-width: 300px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    expect(narrow).toMatch(/\.topbar \{[^}]*flex-wrap: wrap/);
  });
});
