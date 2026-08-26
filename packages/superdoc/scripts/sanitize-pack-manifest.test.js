import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sourceScript = [
  path.join(process.cwd(), 'scripts', 'sanitize-pack-manifest.cjs'),
  path.join(process.cwd(), 'packages', 'superdoc', 'scripts', 'sanitize-pack-manifest.cjs'),
].find(existsSync);

test.each(['dependencies', 'peerDependencies', 'optionalDependencies'])(
  'prepack rejects rollup-plugin-copy in published %s',
  (section) => {
    const packageRoot = mkdtempSync(path.join(os.tmpdir(), 'superdoc-pack-manifest-'));
    const scriptsDir = path.join(packageRoot, 'scripts');
    const scriptPath = path.join(scriptsDir, 'sanitize-pack-manifest.cjs');
    mkdirSync(scriptsDir);
    copyFileSync(sourceScript, scriptPath);
    writeFileSync(
      path.join(packageRoot, 'package.json'),
      `${JSON.stringify({ name: 'superdoc', version: '1.46.3', [section]: { 'rollup-plugin-copy': '^3.5.0' } })}\n`,
    );

    try {
      const result = spawnSync(process.execPath, [scriptPath, 'prepare'], { encoding: 'utf8' });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `package.json ${section}.rollup-plugin-copy is build-only and must not be published`,
      );
      expect(existsSync(path.join(packageRoot, '.package.json.prepack-backup'))).toBe(false);
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  },
);
