#!/usr/bin/env node

/**
 * Compare two baseline result files and report differences.
 * Usage: node lib/compare-baselines.mjs <file-a> <file-b>
 * Example: node lib/compare-baselines.mjs results/baselines/2026-03-01-v1.json results/baselines/2026-03-09-v2.json
 *
 * Matches tests by identity (description + provider + prompt), not array index.
 * Exits with code 1 if regressions are found.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function testKey(r) {
  const desc = r.description || r.testCase?.description || '';
  const provider = r.provider?.label || r.provider?.id || '';
  const prompt = (r.prompt?.label || r.prompt?.raw || '').includes('minimal') ? 'minimal' : 'agent';
  return `${desc}||${provider}||${prompt}`;
}

async function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('Usage: node lib/compare-baselines.mjs <file-a> <file-b>');
    process.exit(1);
  }

  const a = JSON.parse(await readFile(resolve(__dirname, '..', fileA), 'utf8'));
  const b = JSON.parse(await readFile(resolve(__dirname, '..', fileB), 'utf8'));

  const resultsA = a.results?.results || a.results || [];
  const resultsB = b.results?.results || b.results || [];

  console.log(`Baseline A: ${fileA} (${resultsA.length} tests)`);
  console.log(`Baseline B: ${fileB} (${resultsB.length} tests)`);
  console.log('---');

  // Index both baselines by test identity
  const mapA = new Map();
  for (const r of resultsA) mapA.set(testKey(r), r);

  const mapB = new Map();
  for (const r of resultsB) mapB.set(testKey(r), r);

  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  let onlyInA = 0;
  let onlyInB = 0;

  // Compare all tests present in B against A
  for (const [key, rb] of mapB) {
    const ra = mapA.get(key);
    const passB = rb.success ?? rb.pass ?? false;
    const desc = rb.description || rb.testCase?.description || key;

    if (!ra) {
      onlyInB++;
      console.log(`  NEW:       ${desc} (${passB ? 'PASS' : 'FAIL'})`);
      continue;
    }

    const passA = ra.success ?? ra.pass ?? false;
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

  // Report tests only in A (removed)
  for (const [key, ra] of mapA) {
    if (!mapB.has(key)) {
      onlyInA++;
      const desc = ra.description || ra.testCase?.description || key;
      console.log(`  REMOVED:   ${desc}`);
    }
  }

  console.log('---');
  console.log(`Improved: ${improved} | Regressed: ${regressed} | Unchanged: ${unchanged}`);
  if (onlyInB > 0) console.log(`New tests in B: ${onlyInB}`);
  if (onlyInA > 0) console.log(`Removed from A: ${onlyInA}`);

  if (regressed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
