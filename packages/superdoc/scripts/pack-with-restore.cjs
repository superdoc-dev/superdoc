#!/usr/bin/env node

// Runs `pnpm pack` and then ALWAYS restores the source package.json, so a
// pack that dies between its prepack (sanitize) and postpack (restore)
// lifecycle hooks cannot strand a sanitized manifest in the worktree. The
// restore step itself refuses to overwrite an unsanitized manifest (see
// sanitize-pack-manifest.cjs), so a stale backup can never clobber edits.

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const sanitizeScript = path.join(packageRoot, 'scripts', 'sanitize-pack-manifest.cjs');

function spawnStatus(result, label) {
  if (result.error) {
    console.error(`[pack-with-restore] ${label} failed: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`[pack-with-restore] ${label} terminated by signal ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

function restoreManifest() {
  const result = spawnSync(process.execPath, [sanitizeScript, 'restore'], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: { ...process.env, PWD: packageRoot },
  });
  return spawnStatus(result, 'manifest restore');
}

const packResult = spawnSync('pnpm', ['pack'], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: { ...process.env, PWD: packageRoot },
  shell: process.platform === 'win32',
});
const packStatus = spawnStatus(packResult, 'pnpm pack');

const restoreStatus = restoreManifest();
if (restoreStatus !== 0) {
  console.error(
    '[pack-with-restore] manifest restore did not complete; package.json may still be sanitized ' +
      `(backup: .package.json.prepack-backup)${packStatus !== 0 ? ' — pnpm pack also failed above' : ''}`,
  );
}

// Fail on either leg: a green pack with a failed restore must not exit 0
// (the worktree manifest would silently stay sanitized), and a failed pack
// reports its own status without hiding a restore failure (logged above).
process.exit(packStatus !== 0 ? packStatus : restoreStatus);
