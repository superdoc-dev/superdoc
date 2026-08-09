#!/usr/bin/env node
/**
 * Document API public-surface gate. Sibling of `check-public-contract.mjs`
 * (SuperDoc); same staged shape, same failure UX.
 *
 * Non-mutating, clean-checkout safe: stage 2 builds gitignored
 * artifacts in memory so `generate:docapi` is not a prerequisite.
 * Cheap-to-expensive ordering — contract drift fails in seconds.
 *
 * Stages:
 *   1. contract-parity      - operation IDs, member maps, runtime API
 *                             shape must agree.
 *   2. contract-outputs     - schemas and agent artifacts match the
 *                             contract. Built in memory, so a clean
 *                             checkout needs no prior generate step.
 *   3. documented-operations - every contract operation is rendered by
 *                             the documentation site, and the site
 *                             documents nothing the contract omits.
 *
 * Local usage:
 *   pnpm check:public           (umbrella, runs SuperDoc + Document API)
 *   pnpm check:public:docapi    (Document API only, this script)
 *
 * Legacy alias preserved: `pnpm run docapi:check`.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const stages = [
  {
    name: 'contract-parity',
    cwd: REPO_ROOT,
    cmd: 'pnpm',
    args: ['exec', 'tsx', 'packages/document-api/scripts/check-contract-parity.ts'],
    blurb:
      'Operation IDs, operation/member maps, and runtime API shape must agree. ' +
      'Fast; runs first so contract drift fails before slower stages.',
  },
  {
    name: 'contract-outputs',
    cwd: REPO_ROOT,
    cmd: 'pnpm',
    args: ['exec', 'tsx', 'packages/document-api/scripts/check-contract-outputs.ts'],
    blurb:
      'Schemas and agent artifacts built in memory and compared to the contract; ' +
      'no need to run `pnpm run generate:docapi` first.',
  },
  {
    name: 'documented-operations',
    cwd: REPO_ROOT,
    cmd: 'pnpm',
    args: ['exec', 'tsx', 'packages/document-api/scripts/check-documented-operations.ts'],
    blurb:
      'Every operation the contract defines is rendered by the documentation ' +
      'site, and the site documents nothing the contract omits. Regenerates ' +
      'the reference model, so this is the longest stage.',
  },
];

const HR = '='.repeat(72);
const start = Date.now();

let failed = null;
for (const [i, s] of stages.entries()) {
  console.log('');
  console.log(HR);
  console.log(`[${i + 1}/${stages.length}] ${s.name}`);
  console.log(s.blurb);
  console.log(HR);
  const result = spawnSync(s.cmd, s.args, { cwd: s.cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    failed = { stage: s.name, status: result.status ?? 1 };
    break;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log('');
console.log(HR);
if (failed) {
  console.log(`FAIL: stage "${failed.stage}" exited ${failed.status} (after ${elapsed}s)`);
  console.log('');
  console.log('Re-run the failing stage directly to iterate:');
  const failedStage = stages.find((s) => s.name === failed.stage);
  console.log(`  cd ${failedStage.cwd}`);
  console.log(`  ${failedStage.cmd} ${failedStage.args.join(' ')}`);
  process.exit(failed.status);
} else {
  console.log(`PASS: ${stages.length} stages, ${elapsed}s`);
}
