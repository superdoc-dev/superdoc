import path from 'node:path';
import process from 'node:process';
import { loadCases } from '../cases/loader.js';
import { anthropicSdkRunner } from '../runners/anthropic-sdk.js';
import { loadToolSnapshot } from '../tools/snapshot.js';
import {
  evaluateTraceFindContentAssertion,
  isTraceFindContentAssertion,
  loadFixture,
  type TraceFindContentAssertion,
} from './smoke-helpers.js';

const ASSERTION_TYPE = 'anthropic_trace_find_content';
const TAG = '[anthropic:smoke]';

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${TAG} Missing ANTHROPIC_API_KEY.`);
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const casesDir = path.join(repoRoot, 'cases', 'ring0');
  const toolSnapshot = await loadToolSnapshot(repoRoot);
  const model = process.env.MODEL ?? 'claude-opus-4-5';

  const { cases, errors } = await loadCases(casesDir);
  if (errors.length > 0) {
    console.error(`${TAG} Case validation failed. Fix cases first.`);
    process.exit(1);
  }

  let failed = 0;
  let skipped = 0;

  for (const caseDef of cases) {
    const assertions = (caseDef.assertions ?? []).filter((a): a is TraceFindContentAssertion =>
      isTraceFindContentAssertion(a, ASSERTION_TYPE),
    );
    if (assertions.length === 0) {
      skipped += 1;
      console.warn(`${TAG} Skipping ${caseDef.testId}: no ${ASSERTION_TYPE} assertions.`);
      continue;
    }

    const state = await loadFixture(repoRoot, caseDef.fixture);
    const trace = await anthropicSdkRunner.runCase(
      { caseDef, state, toolSnapshot },
      { model, temperature: 0, timeoutMs: 60_000, maxToolCallsPerStep: 5 },
    );

    for (const assertion of assertions) {
      const failures = evaluateTraceFindContentAssertion(caseDef, trace, assertion);
      if (failures.length > 0) {
        failed += 1;
        console.error(`${TAG} ${caseDef.testId} failed:`);
        for (const failure of failures) {
          console.error(`  - ${failure}`);
        }
        continue;
      }

      console.log(`${TAG} ${caseDef.testId} ok.`);
    }
  }

  if (failed > 0) {
    console.error(`${TAG} ${failed} assertion(s) failed. ${skipped} case(s) skipped.`);
    process.exit(1);
  }

  if (skipped > 0) {
    console.warn(`${TAG} All assertions passed. ${skipped} case(s) skipped.`);
  } else {
    console.log(`${TAG} All assertions passed.`);
  }
}

main().catch((error) => {
  console.error(`${TAG} Unexpected failure:`, error);
  process.exit(1);
});
