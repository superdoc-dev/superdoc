/**
 * Custom Promptfoo provider: SuperDoc agent via Vercel AI SDK + AI Gateway.
 *
 * Pass any gateway model ID: "openai/gpt-4o", "anthropic/claude-sonnet-4.6", etc.
 * AI SDK auto-routes through AI Gateway when AI_GATEWAY_API_KEY is set.
 *
 * Config (set in YAML providers section):
 *   modelId: AI Gateway model ID (default: openai/gpt-4o)
 *
 * Vars (set per test):
 *   fixture: DOCX filename in fixtures/ (default: doc-template.docx)
 *   keepFile: Save the edited DOCX to results/output/{evalId}/ (default: false)
 */

import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { copyFileSync, readFileSync } from 'node:fs';
import {
  PATHS,
  cacheKey,
  cleanArgs,
  cleanupTemp,
  createTempCopy,
  loadSdk,
  readCache,
  resolveOutputPath,
  writeCache,
} from './utils.mjs';

const SYSTEM_PROMPT = readFileSync(PATHS.prompt, 'utf8');
const STOP_CONDITION = stepCountIs(10);

if (!process.env.SUPERDOC_CLI_BIN) {
  process.env.SUPERDOC_CLI_BIN = PATHS.cliBin;
}

// --- CLI lifecycle ---

async function openDocument(sdk, docPath, stateDir) {
  const client = sdk.createSuperDocClient({
    startupTimeoutMs: 15_000,
    requestTimeoutMs: 30_000,
    watchdogTimeoutMs: 120_000,
    env: { 
      SUPERDOC_CLI_STATE_DIR: stateDir 
    },
  });
  await client.connect();
  await client.doc.open({ doc: docPath });
  return client;
}

async function closeDocument(client, { save = false } = {}) {
  if (save) await client.doc.save().catch(() => {});
  await client.doc.close().catch(() => {});
  await client.dispose().catch(() => {});
}

// --- Tool conversion ---

function convertTool(fn, sdk, client, toolLog) {
  return tool({
    description: fn.description || '',
    inputSchema: jsonSchema(fn.parameters || { type: 'object', properties: {} }),
    execute: async (args) => {
      const cleaned = cleanArgs(args);
      try {
        const result = await sdk.dispatchSuperDocTool(client, fn.name, cleaned);
        toolLog.push({ tool: fn.name, ok: true });
        return result;
      } catch (err) {
        toolLog.push({ tool: fn.name, ok: false });
        return { ok: false, error: err.message };
      }
    },
  });
}

async function buildTools(sdk, client) {
  const { tools: sdkTools } = await sdk.chooseTools({
    provider: 'vercel',
    includeDiscoverTool: false,
  });

  const toolLog = [];
  const tools = {};

  for (const t of sdkTools) {
    const fn = t.function;
    if (fn?.name) tools[fn.name] = convertTool(fn, sdk, client, toolLog);
  }

  // discover_tools: loads additional tool groups on demand
  tools['discover_tools'] = tool({
    description: 'Load additional tool groups (e.g. tables, lists, comments, create).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { groups: { type: 'array', items: { type: 'string' } } },
      required: ['groups'],
    }),
    execute: async (args) => {
      const groups = Array.isArray(args.groups) ? args.groups : [];
      const { tools: newTools } = await sdk.chooseTools({
        provider: 'vercel',
        groups,
        mode: 'essential',
        includeDiscoverTool: false,
      });
      let added = 0;
      for (const t of newTools) {
        const fn = t.function;
        if (!fn?.name || tools[fn.name]) continue;
        tools[fn.name] = convertTool(fn, sdk, client, toolLog);
        added++;
      }
      toolLog.push({ tool: 'discover_tools', ok: true });
      return { ok: true, loaded: groups, newTools: added };
    },
  });

  return { tools, toolLog };
}

// --- Provider ---

export default class SuperDocAgentGatewayProvider {
  constructor(options) {
    this.options = options || {};
  }

  id() {
    return 'superdoc-agent-gateway';
  }

  async callApi(prompt, context) {
    const sdk = await loadSdk();
    const vars = context?.vars || {};
    const fixture = vars.fixture || 'doc-template.docx';
    const modelId = this.options.config?.modelId || 'openai/gpt-4o';
    const keepFile = vars.keepFile === true || vars.keepFile === 'true';
    const task = vars.task || prompt;

    // Check cache first (skip CLI + LLM if we already have this result)
    const key = cacheKey(modelId, fixture, task, prompt);
    const cached = readCache(key);
    if (cached) return cached;

    const { docPath, stateDir } = createTempCopy(fixture);
    const evalId = context?.evaluationId || `eval-${Date.now()}`;
    const outputPath = keepFile ? resolveOutputPath(evalId, fixture, task) : null;

    let client;
    try {
      client = await openDocument(sdk, docPath, stateDir);
    } catch (err) {
      cleanupTemp(docPath, stateDir);
      return { error: `Failed to open document: ${err.message}` };
    }

    let tools, toolLog;
    try {
      const result = await buildTools(sdk, client);
      tools = result.tools;
      toolLog = result.toolLog;
    } catch (err) {
      await closeDocument(client);
      cleanupTemp(docPath, stateDir);
      return { error: `Failed to build tools: ${err.message}` };
    }

    try {
      const { totalUsage, steps } = await generateText({
        model: modelId,
        system: SYSTEM_PROMPT.replace('{{task}}', task),
        prompt: task,
        tools,
        stopWhen: STOP_CONDITION,
        temperature: 0,
      });

      const documentText = await client.doc.getText();
      await closeDocument(client, { save: keepFile });

      if (keepFile && outputPath) copyFileSync(docPath, outputPath);
      cleanupTemp(docPath, stateDir);

      const result = {
        output: JSON.stringify({
          documentText,
          outputFile: outputPath,
          toolCalls: toolLog,
          turns: toolLog.length,
          usage: totalUsage,
          steps: steps.length,
        }),
      };
      writeCache(key, result);
      return result;
    } catch (err) {
      await closeDocument(client);
      cleanupTemp(docPath, stateDir);
      return { error: `Agent loop failed: ${err.message}` };
    }
  }
}
