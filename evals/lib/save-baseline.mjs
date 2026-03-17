#!/usr/bin/env node

/**
 * Save current eval results as a versioned baseline.
 * Usage: node lib/save-baseline.mjs [label]
 * Creates: results/baselines/<date>-<label>.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, '..', 'results');
const BASELINES_DIR = resolve(RESULTS_DIR, 'baselines');

async function main() {
  const label = process.argv[2] || 'snapshot';
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-${label}.json`;

  const latestPath = resolve(RESULTS_DIR, 'latest.json');
  let data;
  try {
    data = await readFile(latestPath, 'utf8');
  } catch {
    console.error('No results/latest.json found. Run "pnpm run eval" first.');
    process.exit(1);
  }

  await mkdir(BASELINES_DIR, { recursive: true });
  await writeFile(resolve(BASELINES_DIR, filename), data);
  console.log(`Baseline saved: results/baselines/${filename}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
