#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const workspaces = [
  '@superdoc/contracts',
  '@superdoc/pm-adapter',
  '@superdoc/measuring-dom',
  '@superdoc/layout-engine',
  '@superdoc/painter-dom',
];

for (const workspace of workspaces) {
  const result = spawnSync('npm', ['run', 'test', `--workspace=${workspace}`], {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
