/**
 * Custom Promptfoo provider: runs the full SuperDoc agent loop.
 *
 * Opens a real DOCX via CLI -> LLM picks tools -> CLI executes them -> returns document text.
 *
 * Vars:
 *   fixture:  DOCX filename in fixtures/ (default: doc-template.docx)
 *   model:    OpenAI model ID (default: gpt-4o)
 *   keepFile: Save the edited DOCX to results/output/{evalId}/ (default: false)
 */

import { copyFileSync, readFileSync } from 'node:fs';
import { OpenAI } from 'openai';
import {
  PATHS,
  cacheKey,
  loadSdk,
  createTempCopy,
  cleanupTemp,
  readCache,
  resolveOutputPath,
  cleanArgs,
  writeCache,
  dispatchWithRetry,
} from './utils.mjs';

const SYSTEM_PROMPT = readFileSync(PATHS.prompt, 'utf8');
const MAX_TURNS = 10;

if (!process.env.SUPERDOC_CLI_BIN) {
  process.env.SUPERDOC_CLI_BIN = PATHS.cliBin;
}

// --- CLI lifecycle ---

async function openDocument(sdk, docPath, stateDir) {
  const client = sdk.createSuperDocClient({
    startupTimeoutMs: 15_000,
    requestTimeoutMs: 30_000,
    watchdogTimeoutMs: 120_000,
    env: { SUPERDOC_CLI_STATE_DIR: stateDir },
  });
  await client.connect();
  const doc = await client.open({ doc: docPath });
  return { client, doc };
}

async function closeDocument({ client, doc }, { save = false } = {}) {
  if (save) await doc.save().catch(() => {});
  await doc.close().catch(() => {});
  await client.dispose().catch(() => {});
}

// --- Tool management ---

async function loadTools(sdk) {
  const { tools } = await sdk.chooseTools({ provider: 'openai' });
  const map = new Map();
  for (const t of tools) {
    const name = t.function?.name;
    if (name) map.set(name, t);
  }
  return map;
}

// --- Agent loop ---

async function runAgentLoop(sdk, doc, activeToolMap, task, model) {
  const openai = new OpenAI();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: task },
  ];
  const toolLog = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await openai.chat.completions.create({
          model,
          messages,
          tools: [...activeToolMap.values()],
          temperature: 0,
        });
        break;
      } catch (err) {
        if (attempt < 2 && (err.status === 429 || err.status >= 500 || err.message?.includes('Gateway'))) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    const message = response.choices[0].message;
    messages.push(message);
    if (!message.tool_calls?.length) break;

    for (const call of message.tool_calls) {
      const toolName = call.function.name;
      let toolArgs;
      try { toolArgs = JSON.parse(call.function.arguments || '{}'); }
      catch { toolArgs = {}; }

      let result;
      try {
        result = await dispatchWithRetry(sdk, doc, toolName, cleanArgs(toolArgs));
      } catch (err) {
        result = { ok: false, error: err.message };
      }

      toolLog.push({ tool: toolName, ok: !result?.error });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
  }

  return toolLog;
}

// --- Provider ---

export default class SuperDocAgentProvider {
  constructor(options) {
    this.options = options || {};
  }

  id() {
    return 'superdoc-agent';
  }

  async callApi(prompt, context) {
    const sdk = await loadSdk();
    const vars = context?.vars || {};
    const fixture = vars.fixture || 'doc-template.docx';
    const model = vars.model || 'gpt-4o';
    const keepFile = vars.keepFile === true || vars.keepFile === 'true';
    const task = vars.task || prompt;

    // Check cache first
    const key = cacheKey(model, fixture, task);
    const cached = readCache(key);
    if (cached) return cached;

    const { docPath, stateDir } = createTempCopy(fixture);
    const evalId = context?.evaluationId || `eval-${Date.now()}`;
    const outputPath = keepFile ? resolveOutputPath(evalId, fixture, task) : null;

    // Open document
    let handle;
    try {
      handle = await openDocument(sdk, docPath, stateDir);
    } catch (err) {
      cleanupTemp(docPath, stateDir);
      return { error: `Failed to open document: ${err.message}` };
    }

    // Load tools
    let activeToolMap;
    try {
      activeToolMap = await loadTools(sdk);
    } catch (err) {
      await closeDocument(handle);
      cleanupTemp(docPath, stateDir);
      return { error: `Failed to load tools: ${err.message}` };
    }

    // Run agent loop
    try {
      const toolLog = await runAgentLoop(sdk, handle.doc, activeToolMap, task, model);
      const documentText = await handle.doc.getText();

      await closeDocument(handle, { save: keepFile });

      if (keepFile && outputPath) copyFileSync(docPath, outputPath);
      cleanupTemp(docPath, stateDir);

      const result = {
        output: JSON.stringify({
          documentText,
          outputFile: outputPath,
          toolCalls: toolLog,
          turns: toolLog.length,
        }),
      };
      writeCache(key, result);
      return result;
    } catch (err) {
      await closeDocument(handle);
      cleanupTemp(docPath, stateDir);
      return { error: `Agent loop failed: ${err.message}` };
    }
  }
}
