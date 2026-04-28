#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
const forwardedArgs = args[0] === '--' ? args.slice(1) : args;

const result = spawnSync('labs', ['superdoc', 'behavior', ...forwardedArgs], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error('labs CLI was not found on PATH. Install it with `pnpm --dir ../labs run install:cli`.');
  } else {
    console.error(result.error.message);
  }
  process.exit(1);
}

process.exit(result.status ?? 1);
