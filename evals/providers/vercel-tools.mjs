/**
 * Custom Promptfoo provider: Vercel AI SDK with tool calling + live discovery.
 *
 * Tools from the SuperDoc SDK. discover_tools calls the real SDK.
 * All other tools return mock results and capture their args.
 * Returns structured tool calls in OpenAI format for tool-call-f1 assertions.
 *
 * Config (set in YAML):
 *   modelId: AI SDK model ID (e.g. "openai/gpt-4o")
 */

import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { cacheKey, loadSdk, readCache, writeCache } from './utils.mjs';

const STOP_CONDITION = stepCountIs(5);

function convertTool(fn, capturedCalls) {
  return tool({
    description: fn.description || '',
    inputSchema: jsonSchema(fn.parameters || { type: 'object', properties: {} }),
    execute: async (args) => {
      // Capture the call with its args (step.toolCalls strips args after execute)
      capturedCalls.push({ name: fn.name, args });
      return { ok: true, tool: fn.name, args };
    },
  });
}

async function buildTools(capturedCalls) {
  const sdk = await loadSdk();
  const { tools: sdkTools } = await sdk.chooseTools({ provider: 'vercel', });

  const tools = {};
  for (const t of sdkTools) {
    const fn = t.function;
    if (fn?.name) {
      try {
        tools[fn.name] = convertTool(fn, capturedCalls);
      } catch (err) {
        console.warn(`Failed to convert tool "${fn.name}": ${err.message}`);
      }
    }
  }

  // discover_tools: calls real SDK, adds new tools to active set
  tools['discover_tools'] = tool({
    description: 'Load additional tool groups.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { groups: { type: 'array', items: { type: 'string' } } },
      required: ['groups'],
    }),
    execute: async (args) => {
      capturedCalls.push({ name: 'discover_tools', args });
      const groups = Array.isArray(args.groups) ? args.groups : [];
      const { tools: newSdkTools } = await sdk.chooseTools({
        provider: 'vercel',
        groups,
        mode: 'essential',
        includeDiscoverTool: false,
      });

      let added = 0;
      for (const t of newSdkTools) {
        const fn = t.function;
        if (fn?.name && !tools[fn.name]) {
          try {
            tools[fn.name] = convertTool(fn, capturedCalls);
            added++;
          } catch (err) {
            console.warn(`Failed to convert discovered tool "${fn.name}": ${err.message}`);
          }
        }
      }
      return { ok: true, loaded: groups, newTools: added, totalTools: Object.keys(tools).length };
    },
  });

  return tools;
}

export default class VercelToolsProvider {
  constructor(options) {
    this.modelId = options?.config?.modelId || 'openai/gpt-4o';
  }

  id() {
    return `vercel-tools:${this.modelId}`;
  }

  async callApi(prompt, context) {
    const task = context?.vars?.task || '';
    const key = cacheKey(this.modelId, prompt, task, prompt);
    const cached = readCache(key);
    if (cached) return cached;

    // Shared array to capture tool calls with args from execute callbacks
    const capturedCalls = [];

    let tools;
    try {
      tools = await buildTools(capturedCalls);
    } catch (err) {
      return { error: `Failed to build tools: ${err.message}` };
    }

    try {
      await generateText({
        model: this.modelId,
        system: prompt,
        prompt: task || prompt,
        tools,
        stopWhen: STOP_CONDITION,
        temperature: 0,
      });

      // Convert captured calls to OpenAI format
      let result;
      if (capturedCalls.length > 0) {
        const output = capturedCalls.map(c => ({
          type: 'function',
          function: {
            name: c.name,
            arguments: JSON.stringify(c.args || {}),
          },
        }));
        result = { output };
      } else {
        result = { output: '' };
      }

      writeCache(key, result);
      return result;
    } catch (err) {
      return { error: `AI SDK error: ${err.message}` };
    }
  }
}
