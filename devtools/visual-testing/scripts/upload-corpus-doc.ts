#!/usr/bin/env tsx

import path from 'node:path';
import { spawn } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

async function main(): Promise<void> {
  const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const commandArgs = ['run', 'corpus:push', '--', ...passthroughArgs];

  const child = spawn('pnpm', commandArgs, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`Failed to spawn corpus:push: ${err.message}`);
      resolve(1);
    });
  });

  process.exit(Number(exitCode));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[upload] Fatal: ${message}`);
    process.exitCode = 1;
  });
}
