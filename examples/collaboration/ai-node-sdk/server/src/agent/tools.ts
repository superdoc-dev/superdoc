import { chooseTools, dispatchSuperDocTool, getSystemPrompt } from '@superdoc-dev/sdk';

let cachedTools: unknown[] | null = null;
let cachedPrompt: string | null = null;

export async function loadTools(): Promise<unknown[]> {
  if (!cachedTools) {
    const result = await chooseTools({ provider: 'openai' });
    cachedTools = result.tools;
  }
  return cachedTools;
}

export async function loadSystemPrompt(): Promise<string> {
  if (!cachedPrompt) {
    cachedPrompt = await getSystemPrompt();
  }
  return cachedPrompt;
}

export { dispatchSuperDocTool };
