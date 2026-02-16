#!/usr/bin/env tsx

import path from 'node:path';
import { spawn } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function parseArgs(rawArgs: string[]): { commandArgs: string[] } {
  const args = rawArgs.filter((arg) => arg !== '--');
  const hasExplicitDest = args.includes('--dest');
  const forwarded: string[] = [];
  let positionalDest: string | null = null;
  let expectsValueForFlag: string | null = null;
  let seenFlag = false;

  for (const arg of args) {
    if (expectsValueForFlag) {
      forwarded.push(arg);
      expectsValueForFlag = null;
      continue;
    }

    if (arg.startsWith('-')) {
      seenFlag = true;
    }

    if (arg === '--dest' || arg === '--filter' || arg === '--match' || arg === '--exclude') {
      forwarded.push(arg);
      expectsValueForFlag = arg;
      continue;
    }

    if (!arg.startsWith('-') && !hasExplicitDest && positionalDest === null && !seenFlag) {
      positionalDest = arg;
      continue;
    }

    forwarded.push(arg);
  }

  const defaultDest = positionalDest ?? 'test-docs';
  const resolvedDest = hasExplicitDest ? null : path.resolve(process.cwd(), defaultDest);
  const commandArgs = ['run', 'corpus:pull', '--'];

  if (resolvedDest) {
    commandArgs.push('--dest', resolvedDest);
  }

  commandArgs.push(...forwarded);
  return { commandArgs };
}

async function main(): Promise<void> {
  const { commandArgs } = parseArgs(process.argv.slice(2));
  const child = spawn('pnpm', commandArgs, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`Failed to spawn corpus:pull: ${err.message}`);
      resolve(1);
    });
  });

  process.exit(Number(exitCode));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[get-corpus] Fatal: ${message}`);
    process.exitCode = 1;
  });
}
