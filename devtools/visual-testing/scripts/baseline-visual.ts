#!/usr/bin/env tsx

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { colors } from './terminal.js';
import { generateBaselineFolderName, getBaselineRootDir } from './generate-refs.js';
import { uploadDirectoryToR2 } from './r2-baselines.js';
import { parseStorageFlags, resolveDocsDir } from './storage-flags.js';

const HARNESS_PORT = 9989;
const HARNESS_HOSTS = ['127.0.0.1', '::1'];
const HARNESS_URL = `http://localhost:${HARNESS_PORT}`;

function runCommand(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

async function isPortOpenOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onFailure = () => {
      socket.destroy();
      resolve(false);
    };

    socket.setTimeout(1_000);
    socket.once('error', onFailure);
    socket.once('timeout', onFailure);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

async function isPortOpen(port: number): Promise<boolean> {
  const checks = await Promise.all(HARNESS_HOSTS.map((host) => isPortOpenOnHost(port, host)));
  return checks.some(Boolean);
}

function extractVersion(args: string[]): string | undefined {
  const flagsWithValue = new Set([
    '--filter',
    '--match',
    '--exclude',
    '--doc',
    '--parallel',
    '--output',
    '--browser',
    '--scale-factor',
    '--docs',
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (flagsWithValue.has(arg)) {
        i++;
      }
      continue;
    }
    return arg;
  }
  return undefined;
}

async function main(): Promise<void> {
  const passThrough = process.argv.slice(2);
  const version = extractVersion(passThrough);
  const storage = parseStorageFlags(passThrough);
  resolveDocsDir(storage.mode, storage.docsDir);

  if (version && process.env.SUPERDOC_SKIP_VERSION_SWITCH !== '1') {
    if (await isPortOpen(HARNESS_PORT)) {
      console.error(colors.error(`Harness is already running at ${HARNESS_URL}. Stop it before switching versions.`));
      process.exit(1);
    }
    console.log(colors.info(`Switching to ${version}...`));
    await runCommand(['exec', 'tsx', 'scripts/set-superdoc-version.ts', version]);
  }

  console.log(colors.info('Generating visual baselines...'));
  await runCommand(['exec', 'tsx', 'scripts/generate-refs.ts', '--baseline', ...passThrough]);
  console.log(colors.info('Visual baseline generation complete.'));

  const baselineLabel = generateBaselineFolderName(version);
  const localDir = getBaselineRootDir(version, storage.mode);
  const remotePrefix = path.posix.join('baselines', baselineLabel);

  if (!fs.existsSync(localDir)) {
    console.log(colors.warning('No visual baselines generated; skipping upload.'));
    return;
  }

  if (storage.mode === 'local') {
    console.log(colors.success(`✅ Local baselines saved to ${localDir}`));
    return;
  }

  console.log(colors.info(`Uploading baselines to R2: ${remotePrefix}`));
  const uploaded = await uploadDirectoryToR2({ localDir, remotePrefix });
  console.log(colors.success(`Uploaded ${uploaded} baseline file(s) to R2.`));

  console.log(colors.info(`Cleaning up local baselines at ${localDir}`));
  fs.rmSync(localDir, { recursive: true, force: true });
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
