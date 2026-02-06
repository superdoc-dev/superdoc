import type { Runner } from './types.js';
import { openaiRawRunner } from './openai-raw.js';
import { openaiSdkRunner } from './openai-sdk.js';
import { anthropicSdkRunner } from './anthropic-sdk.js';
import { vercelAiRunner } from './vercel-ai.js';

export const runners: Record<string, Runner> = {
  [openaiRawRunner.name]: openaiRawRunner,
  [openaiSdkRunner.name]: openaiSdkRunner,
  [anthropicSdkRunner.name]: anthropicSdkRunner,
  [vercelAiRunner.name]: vercelAiRunner,
};

export function getRunner(name: string): Runner | null {
  return runners[name] ?? null;
}

export { openaiRawRunner } from './openai-raw.js';
export { openaiSdkRunner } from './openai-sdk.js';
export { anthropicSdkRunner } from './anthropic-sdk.js';
export { vercelAiRunner } from './vercel-ai.js';
export type { Runner, RunnerInput, RunnerOptions, ModelAdapter } from './types.js';
