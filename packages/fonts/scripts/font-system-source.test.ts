// Guards the fail-open bug these scripts shipped with: a missing font-system
// path printed "standalone install" and exited 0, so `check:families` stayed
// green while comparing nothing. The distinction that makes failing safe is
// `pnpm-workspace.yaml` at the expected repository root, so that is what these
// cases pin.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { FONT_SYSTEM_ASSETS, FONT_SYSTEM_OFFERINGS, inMonorepo, resolveFontSystemPath } from './font-system-source.mjs';

describe('font-system source resolution', () => {
  it('resolves the real paths from inside this repository', () => {
    expect(inMonorepo()).toBe(true);
    expect(resolveFontSystemPath(FONT_SYSTEM_OFFERINGS, 'source').ok).toBe(true);
    expect(resolveFontSystemPath(FONT_SYSTEM_ASSETS, 'assets directory').ok).toBe(true);
  });

  it('treats a missing path inside the monorepo as a failure, not a skip', () => {
    const result = resolveFontSystemPath(join(FONT_SYSTEM_ASSETS, 'does-not-exist'), 'assets directory');

    expect(result.ok).toBe(false);
    expect(result.skip).toBe(false);
    // The message has to name the fix, because the reader is someone who just
    // moved or renamed the package and needs to know which constant to update.
    expect(result.message).toMatch(/missing inside the monorepo/u);
    expect(result.message).toMatch(/font-system-source\.mjs/u);
  });
});

describe('outside this repository', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'superdoc-fonts-standalone-'));
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  /** Mirrors the layout the module resolves against: <root>/packages/fonts/scripts. */
  async function loadAt(installRoot: string) {
    const scripts = join(installRoot, 'packages/fonts/scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(
      join(scripts, 'font-system-source.mjs'),
      readFileSync(new URL('./font-system-source.mjs', import.meta.url), 'utf8'),
    );
    return import(join(scripts, 'font-system-source.mjs'));
  }

  it('skips rather than fails when there is no root manifest above the package', async () => {
    // What a published install looks like once npm has run `prepare` from a git
    // dependency: the scripts are there, our repository is not.
    const standalone = await loadAt(root);

    expect(standalone.inMonorepo()).toBe(false);
    const result = standalone.resolveFontSystemPath(standalone.FONT_SYSTEM_OFFERINGS, 'source');
    expect(result.ok).toBe(false);
    expect(result.skip).toBe(true);
    expect(result.message).toMatch(/standalone install/u);
  });

  it('skips inside an unrelated pnpm workspace that vendored this package', async () => {
    // Every pnpm monorepo has pnpm-workspace.yaml, so keying on that file alone
    // made a consumer who vendored this source into their own packages/fonts/
    // look like us, and turned their build into a hard failure over a check that
    // cannot apply to them.
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'someone-elses-monorepo', private: true }));

    const vendored = await loadAt(root);

    expect(vendored.inMonorepo()).toBe(false);
    expect(vendored.resolveFontSystemPath(vendored.FONT_SYSTEM_OFFERINGS, 'source').skip).toBe(true);
  });
});
