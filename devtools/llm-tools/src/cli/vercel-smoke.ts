import path from 'node:path';
import process from 'node:process';
import { loadCases } from '../cases/loader.js';
import { vercelAiRunner, detectProviderMode, type VercelProviderMode } from '../runners/vercel-ai.js';
import { loadToolSnapshot } from '../tools/snapshot.js';
import {
  evaluateTraceFindContentAssertion,
  isTraceFindContentAssertion,
  loadFixture,
  type TraceFindContentAssertion,
} from './smoke-helpers.js';

const ASSERTION_TYPE = 'vercel_trace_find_content';
const TAG = '[vercel:smoke]';

function defaultModelForMode(mode: Exclude<VercelProviderMode | 'unknown', 'unknown'>): string {
  if (mode === 'openai') return 'gpt-5';
  if (mode === 'openai-compatible') return process.env.OPENAI_COMPATIBLE_MODEL ?? 'gpt-4o-mini';
  return process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
}

async function main() {
  const mode = detectProviderMode();
  if (mode === 'unknown') {
    console.error(`${TAG} Unknown VERCEL_AI_PROVIDER. Expected one of: ollama, openai, openai-compatible.`);
    process.exit(1);
  }

  if (mode === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error(`${TAG} Missing OPENAI_API_KEY for VERCEL_AI_PROVIDER=openai.`);
    process.exit(1);
  }

  if (mode === 'openai-compatible' && !process.env.OPENAI_COMPATIBLE_BASE_URL) {
    console.error(`${TAG} Missing OPENAI_COMPATIBLE_BASE_URL for VERCEL_AI_PROVIDER=openai-compatible.`);
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const casesDir = path.join(repoRoot, 'cases', 'ring0');
  const toolSnapshot = await loadToolSnapshot(repoRoot);
  const model = process.env.MODEL ?? defaultModelForMode(mode);
  const timeoutMs = Number(process.env.VERCEL_SMOKE_TIMEOUT_MS ?? '40000');
  const maxToolCallsPerStep = Number(process.env.VERCEL_SMOKE_MAX_TOOL_CALLS ?? '5');

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
    const trace = await vercelAiRunner.runCase(
      { caseDef, state, toolSnapshot },
      {
        model,
        temperature: 0,
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 40000,
        maxToolCallsPerStep: Number.isFinite(maxToolCallsPerStep) ? maxToolCallsPerStep : 5,
      },
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
