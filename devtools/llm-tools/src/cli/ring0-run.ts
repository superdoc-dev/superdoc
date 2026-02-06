import path from 'node:path';
import process from 'node:process';
import { loadCases } from '../cases/loader.js';
import { executeTool } from '../sandbox/executor.js';
import { loadToolSnapshot } from '../tools/snapshot.js';
import { loadFixture } from './smoke-helpers.js';

const ASSERTION_TYPE = 'sandbox_find_content';

type SandboxFindContentAssertion = {
  type: typeof ASSERTION_TYPE;
  pattern: string;
  flags?: string;
  minMatches?: number;
  expectedTotal?: number;
  limit?: number;
  offset?: number;
};

function isFindContentAssertion(value: unknown): value is SandboxFindContentAssertion {
  if (!value || typeof value !== 'object') return false;
  const data = value as SandboxFindContentAssertion;
  return data.type === ASSERTION_TYPE && typeof data.pattern === 'string' && data.pattern.length > 0;
}

async function main() {
  const repoRoot = process.cwd();
  const casesDir = path.join(repoRoot, 'cases', 'ring0');
  const toolSnapshot = await loadToolSnapshot(repoRoot);

  const { cases, errors } = await loadCases(casesDir);
  if (errors.length > 0) {
    console.error('[ring0:run] Case validation failed. Fix cases first.');
    process.exit(1);
  }

  if (cases.length === 0) {
    console.warn('[ring0:run] No ring0 cases found.');
    return;
  }

  let failed = 0;
  let skipped = 0;

  for (const caseDef of cases) {
    const assertions = (caseDef.assertions ?? []).filter(isFindContentAssertion);
    if (assertions.length === 0) {
      skipped += 1;
      console.warn(`[ring0:run] Skipping ${caseDef.testId}: no ${ASSERTION_TYPE} assertions.`);
      continue;
    }

    const state = await loadFixture(repoRoot, caseDef.fixture);

    for (const assertion of assertions) {
      const result = executeTool(
        state,
        'find_content',
        {
          selector: {
            type: 'text',
            pattern: assertion.pattern,
            flags: assertion.flags ?? 'i',
          },
          limit: assertion.limit,
          offset: assertion.offset,
        },
        toolSnapshot,
      );

      if (!result.ok) {
        failed += 1;
        console.error(`[ring0:run] ${caseDef.testId} failed: ${result.error}`);
        continue;
      }

      const total = (result.result as { total?: number }).total ?? 0;
      const minMatches = assertion.minMatches ?? 1;

      if (assertion.expectedTotal != null && total !== assertion.expectedTotal) {
        failed += 1;
        console.error(`[ring0:run] ${caseDef.testId} failed: expected total ${assertion.expectedTotal}, got ${total}.`);
        continue;
      }

      if (total < minMatches) {
        failed += 1;
        console.error(`[ring0:run] ${caseDef.testId} failed: expected >= ${minMatches}, got ${total}.`);
        continue;
      }

      console.log(`[ring0:run] ${caseDef.testId} ok (total=${total}).`);
    }
  }

  if (failed > 0) {
    console.error(`[ring0:run] ${failed} assertion(s) failed. ${skipped} case(s) skipped.`);
    process.exit(1);
  }

  if (skipped > 0) {
    console.warn(`[ring0:run] All assertions passed. ${skipped} case(s) skipped.`);
  } else {
    console.log('[ring0:run] All assertions passed.');
  }
}

main().catch((error) => {
  console.error('[ring0:run] Unexpected failure:', error);
  process.exit(1);
});
