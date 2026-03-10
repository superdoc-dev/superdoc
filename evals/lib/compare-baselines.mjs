#!/usr/bin/env node

/**
 * Compare two baseline result files and report differences.
 * Usage: node lib/compare-baselines.mjs <file-a> <file-b>
 * Example: node scripts/compare-baselines.mjs results/baselines/2026-03-01-v1.json results/baselines/2026-03-09-v2.json
 *
 * Exits with code 1 if regressions are found.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('Usage: node scripts/compare-baselines.mjs <file-a> <file-b>');
    process.exit(1);
  }

  const a = JSON.parse(await readFile(resolve(__dirname, '..', fileA), 'utf8'));
  const b = JSON.parse(await readFile(resolve(__dirname, '..', fileB), 'utf8'));

  const resultsA = a.results?.results || a.results || [];
  const resultsB = b.results?.results || b.results || [];

  console.log(`Baseline A: ${fileA} (${resultsA.length} tests)`);
  console.log(`Baseline B: ${fileB} (${resultsB.length} tests)`);
  console.log('---');

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  const maxLen = Math.max(resultsA.length, resultsB.length);
  for (let i = 0; i < maxLen; i++) {
    const ra = resultsA[i];
    const rb = resultsB[i];
    if (!ra || !rb) continue;

    const passA = ra.success ?? ra.pass ?? false;
    const passB = rb.success ?? rb.pass ?? false;
    const desc = rb.description || rb.testCase?.description || `Test ${i}`;

    if (!passA && passB) {
      improved++;
      console.log(`  IMPROVED:  ${desc}`);
    } else if (passA && !passB) {
      regressed++;
      console.log(`  REGRESSED: ${desc}`);
    } else {
      unchanged++;
    }
  }

  console.log('---');
  console.log(`Improved: ${improved} | Regressed: ${regressed} | Unchanged: ${unchanged}`);

  if (regressed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
