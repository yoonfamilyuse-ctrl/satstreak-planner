import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('dev-only tools', () => {
  it('the break-ui data switch is not in the production build', () => {
    execSync('npx vite build --outDir node_modules/.tmp-devonly --emptyOutDir --logLevel error', { cwd: ROOT, stdio: 'pipe' });
    const dir = join(ROOT, 'node_modules/.tmp-devonly/assets');
    const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(js).not.toContain('dev.breakui.pending');
    expect(js).not.toContain('ASTOUNDING ALEXANDRA');
    expect(js).toContain('Sat-Streak Planner');
  }, 60_000);
});
