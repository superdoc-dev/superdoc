// Tool artifacts re-exported from the workspace tools directory.
// JSON imports are resolved at build time by the consumer's bundler.
// The system prompt is embedded as a TS string constant (generated from system-prompt.md).

// @ts-ignore — JSON import resolved by bundler
import catalog from '../tools/catalog.json';
// @ts-ignore — JSON import resolved by bundler
import toolsOpenai from '../tools/tools.openai.json';
import { SYSTEM_PROMPT } from './system-prompt';
import type { ToolCatalog } from './validate';

/** Get the tool catalog (used internally for validation). */
export function getCatalogJson(): ToolCatalog {
  return catalog as ToolCatalog;
}

/** Get the OpenAI-formatted tool definitions for chat completions. */
export function getOpenAITools(): any[] {
  return (toolsOpenai as { tools: any[] }).tools;
}

/** Get the system prompt for the agent. */
export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
