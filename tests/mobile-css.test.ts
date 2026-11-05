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
});
