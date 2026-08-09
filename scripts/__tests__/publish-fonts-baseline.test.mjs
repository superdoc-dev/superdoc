import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  CANONICAL_PACKAGE_NAME,
  KNOWN_ARTIFACT_VIOLATIONS,
  assertOnlyKnownViolations,
} = require('../publish-fonts.cjs');

const silent = { log() {} };

test('the fonts build fails loudly when its workspace filter matches nothing', () => {
  // A pnpm filter that matches no project exits 0 and builds nothing. Without
  // --fail-if-no-match a workspace rename turns the build into a silent no-op,
  // and the publish goes on to audit and upload whatever dist is already in the
  // checkout. Captured from the real spawn rather than the source text, so a
  // refactor that keeps the string but changes what is executed still fails.
  const scriptsDir = path.dirname(fileURLToPath(new URL('../publish-fonts.cjs', import.meta.url)));
  const probe = `
    const cp = require('node:child_process');
    cp.execFileSync = (command, args) => {
      if (command === 'pnpm') { console.log(JSON.stringify([command, ...args])); process.exit(0); }
      return '';
    };
    const { publishFontsPackage } = require(${JSON.stringify(path.join(scriptsDir, 'publish-fonts.cjs'))});
    try { publishFontsPackage({ build: true, logger: { log() {} } }); } catch {}
  `;

  const argv = JSON.parse(execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' }).trim());

  assert.deepEqual(argv, ['pnpm', '--filter', CANONICAL_PACKAGE_NAME, '--fail-if-no-match', 'build']);
});

test('the canonical constant matches the real fonts workspace name', () => {
  // --fail-if-no-match only helps if the name is right; a constant that drifted
  // from the workspace would fail at release time rather than here.
  const manifest = JSON.parse(
    readFileSync(new URL('../../packages/fonts/package.json', import.meta.url), 'utf8'),
  );

  assert.equal(manifest.name, CANONICAL_PACKAGE_NAME);
});

/**
 * Build a tarball whose contents reproduce the fonts baseline exactly: raw .ts
 * files under src/, a bundled source map plus its sourceMappingURL, and a
 * `source` export condition.
 *
 * Constructed rather than fetched so the test stays hermetic. It is kept in
 * step with the real package by `the baseline matches the real fonts package`
 * in the registry lane.
 */
const buildBaselineTarball = (mutate) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fonts-baseline-'));
  const pkg = path.join(dir, 'package');
  mkdirSync(path.join(pkg, 'src'), { recursive: true });
  mkdirSync(path.join(pkg, 'dist'), { recursive: true });

  writeFileSync(
    path.join(pkg, 'package.json'),
    `${JSON.stringify(
      {
        name: '@superdoc/fonts',
        version: '0.0.0',
        exports: { '.': { source: './src/index.ts', default: './dist/index.js' } },
      },
      null,
      2,
    )}\n`,
  );

  for (const name of [
    'asset-urls',
    'bundled-families',
    'bundled-files',
    'cdn-entry.test',
    'cdn-entry',
    'curation',
    'index.test',
    'index',
  ]) {
    writeFileSync(path.join(pkg, 'src', `${name}.ts`), 'export const x = 1;\n');
  }

  writeFileSync(
    path.join(pkg, 'dist', 'superdoc-fonts.min.js'),
    'export const x=1;\n//# sourceMappingURL=superdoc-fonts.min.js.map\n',
  );
  writeFileSync(path.join(pkg, 'dist', 'superdoc-fonts.min.js.map'), '{"version":3}\n');

  if (mutate) mutate(pkg);

  const tarball = path.join(dir, 'package.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', dir, 'package']);
  return { tarball, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

const withTarball = (mutate, run) => {
  const { tarball, cleanup } = buildBaselineTarball(mutate);
  try {
    return run(tarball);
  } finally {
    cleanup();
  }
};

test('an artifact matching the baseline exactly is allowed to publish', () => {
  withTarball(null, (tarball) => {
    assert.doesNotThrow(() => assertOnlyKnownViolations(tarball, 'fonts', silent));
  });
});

test('a violation outside the baseline blocks the release', () => {
  // The case the allowlist exists to catch: something new leaked into the
  // tarball and must not ride out on the back of the known exemptions.
  withTarball(
    (pkg) => writeFileSync(path.join(pkg, 'src', 'leaked.ts'), 'export const leaked = 1;\n'),
    (tarball) => {
      assert.throws(
        () => assertOnlyKnownViolations(tarball, 'fonts', silent),
        /violations that are not in the fonts baseline[\s\S]*leaked\.ts/u,
      );
    },
  );
});

test('a baseline violation that no longer occurs blocks the release', () => {
  // Without this, fixing a violation leaves its exemption behind, and the
  // exemption silently re-permits the same violation when it returns.
  withTarball(
    (pkg) => rmSync(path.join(pkg, 'src', 'curation.ts')),
    (tarball) => {
      assert.throws(
        () => assertOnlyKnownViolations(tarball, 'fonts', silent),
        /exemptions are stale[\s\S]*curation\.ts/u,
      );
    },
  );
});

test('the baseline has no duplicate entries', () => {
  assert.equal(
    new Set(KNOWN_ARTIFACT_VIOLATIONS).size,
    KNOWN_ARTIFACT_VIOLATIONS.length,
    'a duplicated exemption would survive one cleanup and keep permitting the violation',
  );
});

test('a leaked marker inside a baseline-exempted file blocks the release', () => {
  // The baseline exempts raw .ts files by type, and the auditor stops at that
  // classification without reading them. Without a content scan, a private v2
  // source path or an absolute build path planted in one would ship.
  withTarball(
    (pkg) =>
      writeFileSync(
        path.join(pkg, 'src', 'index.ts'),
        'import secret from "../../v2/src/internal";\nexport const x = secret;\n',
      ),
    (tarball) => {
      assert.throws(
        () => assertOnlyKnownViolations(tarball, 'fonts', silent),
        /leaked markers inside baseline-exempted files[\s\S]*v2\/src/u,
      );
    },
  );
});

test('every absolute build path form the auditor rejects is also caught here', () => {
  // The scan reuses the auditor's own marker lists. A local copy drifted once
  // already: it checked two hardcoded strings while the auditor rejected four
  // forms, so a Windows or /private/var/folders path passed here and failed
  // nowhere.
  const paths = [
    '/Users/someone/repo',
    '/home/runner/work/orbit',
    '/private/var/folders/xy/build',
    String.raw`C:\Users\dev\repo`,
  ];

  for (const leaked of paths) {
    withTarball(
      (pkg) => writeFileSync(path.join(pkg, 'src', 'index.ts'), `// built at ${leaked}\n`),
      (tarball) => {
        assert.throws(
          () => assertOnlyKnownViolations(tarball, 'fonts', silent),
          /leaked markers inside baseline-exempted files/u,
          `${leaked} should be rejected`,
        );
      },
    );
  }
});

test('ordinary file contents do not trip the content scan', () => {
  withTarball(
    (pkg) => writeFileSync(path.join(pkg, 'src', 'index.ts'), 'export const x = 1;\n'),
    (tarball) => {
      assert.doesNotThrow(() => assertOnlyKnownViolations(tarball, 'fonts', silent));
    },
  );
});
