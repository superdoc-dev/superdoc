import path from 'node:path';
import process from 'node:process';
import { loadCases } from '../cases/loader.js';
import { loadToolSnapshot } from '../tools/snapshot.js';
import { getRunner, runners } from '../runners/index.js';
import { createHeuristicAdapter } from '../runners/openai-raw.js';
import { loadFixture } from './smoke-helpers.js';

function usage(): string {
  return 'Usage: pnpm run case:run <testId> [runnerName]';
}

function defaultModelForRunner(runnerName: string): string {
  const vercelProvider = (process.env.VERCEL_AI_PROVIDER ?? '').trim().toLowerCase();

  switch (runnerName) {
    case 'openai-raw':
      return 'heuristic-mock';
    case 'openai-sdk':
      return 'gpt-5';
    case 'anthropic-sdk':
      return 'claude-opus-4-5';
    case 'vercel-ai':
      if (vercelProvider === 'openai') {
        return 'gpt-5';
      }
      if (
        vercelProvider === 'openai-compatible' ||
        vercelProvider === 'openai_compatible' ||
        vercelProvider === 'compatible' ||
        vercelProvider === 'lmstudio'
      ) {
        return process.env.OPENAI_COMPATIBLE_MODEL ?? 'gpt-4o-mini';
      }
      return process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
    default:
      return 'gpt-5';
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testId = args[0];
  const runnerName = args[1] ?? 'openai-raw';

  if (!testId) {
    console.error(usage());
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const casesDir = path.join(repoRoot, 'cases');

  const { cases, errors } = await loadCases(casesDir);
  if (errors.length > 0) {
    console.error('[case:run] Case validation failed. Fix cases first.');
    process.exit(1);
  }

  const caseDef = cases.find((entry) => entry.testId === testId);
  if (!caseDef) {
    console.error(`[case:run] Unknown testId: ${testId}`);
    console.error(`[case:run] Available: ${cases.map((entry) => entry.testId).join(', ')}`);
    process.exit(1);
  }

  const runner = getRunner(runnerName);
  if (!runner) {
    console.error(`[case:run] Unknown runner: ${runnerName}`);
    console.error(`[case:run] Available: ${Object.keys(runners).join(', ')}`);
    process.exit(1);
  }

  const toolSnapshot = await loadToolSnapshot(repoRoot);
  const state = await loadFixture(repoRoot, caseDef.fixture);

  const trace = await runner.runCase(
    {
      caseDef,
      state,
      toolSnapshot,
    },
    {
      model: process.env.MODEL ?? defaultModelForRunner(runnerName),
      adapter: runnerName === 'openai-raw' ? createHeuristicAdapter() : undefined,
      temperature: 0,
    },
  );

  process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
}

main().catch((error) => {
  console.error('[case:run] Failed:', error);
  process.exit(1);
});
