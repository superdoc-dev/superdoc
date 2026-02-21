#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PYTHON_EMBEDDED_CLI_TARGETS, toPythonWheelEmbeddedCliEntries } from './python-embedded-cli-targets.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const PYTHON_DIST_DIR = path.join(REPO_ROOT, 'packages/sdk/langs/python/dist');

export function findMissingWheelEntries(entries, targets = PYTHON_EMBEDDED_CLI_TARGETS) {
  const expected = toPythonWheelEmbeddedCliEntries(targets);
  const present = new Set(entries);
  return expected.filter((entry) => !present.has(entry));
}

async function listWheelEntries(wheelPath) {
  const python = 'import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))';
  const { stdout } = await execFileAsync('python3', ['-c', python, wheelPath], {
    cwd: REPO_ROOT,
    env: process.env,
  });
  return JSON.parse(stdout);
}

async function resolveWheelPath(argv) {
  if (argv.length > 0) return path.resolve(argv[0]);

  const entries = await readdir(PYTHON_DIST_DIR, { withFileTypes: true });
  const wheels = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.whl'))
    .map((entry) => path.join(PYTHON_DIST_DIR, entry.name))
    .sort();

  if (wheels.length === 0) {
    throw new Error(`No wheel found in ${PYTHON_DIST_DIR}`);
  }

  return wheels[wheels.length - 1];
}

export async function verifyPythonWheelEmbeddedCli({ wheelPath, targets = PYTHON_EMBEDDED_CLI_TARGETS } = {}) {
  const resolvedWheelPath = wheelPath ?? await resolveWheelPath([]);
  const entries = await listWheelEntries(resolvedWheelPath);
  const missing = findMissingWheelEntries(entries, targets);
  if (missing.length > 0) {
    throw new Error(`Wheel is missing embedded CLI binaries: ${missing.join(', ')}`);
  }
  return resolvedWheelPath;
}

async function main() {
  const argv = process.argv.slice(2);
  const wheelPath = await resolveWheelPath(argv);
  const resolved = await verifyPythonWheelEmbeddedCli({ wheelPath });
  console.log(`Verified embedded CLI binaries in ${resolved}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
