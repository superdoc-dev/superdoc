#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const privateV2Root = path.resolve(workspaceRoot, '..', 'v2');
const skipPrivateV2Prebuild = process.env.SUPERDOC_SKIP_PRIVATE_V2_PREBUILD === '1';
const requirePreparedCandidate = process.env.SUPERDOC_V2_CI_REQUIRE_PREPARED === '1';

if (requirePreparedCandidate) {
  throw new Error(
    'Prepared-candidate mode forbids rebuilding the public SuperDoc package. Materialize the sealed candidate instead.',
  );
}

if (!existsSync(path.join(privateV2Root, 'package.json'))) {
  console.log('[superdoc:prebuild] No internal DOCX Engine workspace found; using the installed package.');
  process.exit(0);
}

if (skipPrivateV2Prebuild) {
  console.log(
    '[superdoc:prebuild] Skipping the internal DOCX Engine build (SUPERDOC_SKIP_PRIVATE_V2_PREBUILD=1).',
  );
  process.exit(0);
}

console.log('[superdoc:prebuild] Building the internal DOCX Engine workspace.');
run('pnpm', ['--filter', '@superdoc/docx-engine', 'run', 'build'], { cwd: workspaceRoot });

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.signal) {
    console.error(`${command} exited from signal ${result.signal}`);
    process.exit(1);
  }
}
