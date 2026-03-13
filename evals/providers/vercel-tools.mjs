/**
 * Custom Promptfoo provider: Vercel AI SDK with tool calling support.
 *
 * Uses the SuperDoc SDK's chooseTools({ provider: 'vercel' }) which produces
 * properly formatted tools for the Vercel AI SDK. Returns structured tool
 * calls in OpenAI format so tool-call-f1 assertions work.
 *
 * Config (set in YAML):
 *   modelId: AI SDK model ID (e.g. "openai/gpt-4o", "anthropic/claude-haiku-4.5")
 */

import { generateText, jsonSchema, tool } from 'ai';
import { loadSdk } from './utils.mjs';

function convertTool(fn) {
  return tool({
    description: fn.description || '',
    inputSchema: jsonSchema(fn.parameters || { type: 'object', properties: {} }),
  });
}

async function buildTools() {
  const sdk = await loadSdk();
  const { tools: sdkTools } = await sdk.chooseTools({
    provider: 'vercel',
    includeDiscoverTool: true,
  });

  const tools = {};
  for (const t of sdkTools) {
    const fn = t.function;
    if (!fn?.name) continue;
    try {
      tools[fn.name] = convertTool(fn);
    } catch (err) {
      console.warn(`Skipping tool ${fn.name}: ${err.message}`);
    }
  }
  return tools;
}

export default class VercelToolsProvider {
  constructor(options) {
    this.modelId = options?.config?.modelId || 'openai/gpt-4o';
  }

  id() {
    return `vercel-tools:${this.modelId}`;
  }

  async callApi(prompt) {
    let tools;
    try {
      tools = await buildTools();
    } catch (err) {
      return { error: `Failed to build tools: ${err.message}` };
    }

    try {
      const result = await generateText({
        model: this.modelId,
        prompt,
        tools,
        maxSteps: 1,
        temperature: 0,
      });

      // Convert AI SDK tool calls to OpenAI format for Promptfoo assertions
      const toolCalls = [];
      for (const step of result.steps || []) {
        for (const tc of step.toolCalls || []) {
          toolCalls.push({
            type: 'function',
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.args),
            },
          });
        }
      }

      if (toolCalls.length > 0) {
        return { output: toolCalls };
      }

      return { output: result.text || '' };
    } catch (err) {
      return { error: `AI SDK error: ${err.message}` };
    }
  }
}
