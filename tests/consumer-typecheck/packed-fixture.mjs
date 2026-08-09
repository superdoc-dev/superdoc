import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function installPackedSuperdocFixture({ fixtureRoot, superdocTarball, engineTarball }) {
  const manifestPath = join(fixtureRoot, 'package.json');
  const originalManifest = readFileSync(manifestPath, 'utf8');

  try {
    const manifest = JSON.parse(originalManifest);
    manifest.dependencies = {
      ...manifest.dependencies,
      superdoc: `file:${superdocTarball}`,
      ...(engineTarball ? { '@superdoc/docx-engine': `file:${engineTarball}` } : {}),
    };
    if (engineTarball) {
      manifest.pnpm = {
        ...manifest.pnpm,
        overrides: {
          ...manifest.pnpm?.overrides,
          '@superdoc/docx-engine': `file:${engineTarball}`,
        },
      };
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    execFileSync(
      'pnpm',
      [
        'install',
        '--ignore-workspace',
        '--ignore-scripts',
        '--no-frozen-lockfile',
        '--no-lockfile',
        '--prefer-offline',
      ],
      { cwd: fixtureRoot, stdio: 'inherit' },
    );
  } finally {
    writeFileSync(manifestPath, originalManifest);
  }
}
