/**
 * Custom Promptfoo provider that runs the full SuperDoc agent loop.
 *
 * Opens a real DOCX file via the CLI, sends prompt to LLM,
 * executes tool calls against the document, loops until done,
 * returns the final document text.
 */

import { copyFileSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAI } from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = resolve(EVALS_ROOT, 'fixtures');
const OUTPUT_DIR = resolve(EVALS_ROOT, 'results/output');
const SYSTEM_PROMPT = readFileSync(resolve(EVALS_ROOT, 'prompts/agent.txt'), 'utf8');

// Point SDK at the local CLI build
if (!process.env.SUPERDOC_CLI_BIN) {
  process.env.SUPERDOC_CLI_BIN = resolve(EVALS_ROOT, '../apps/cli/dist/index.js');
}

const MAX_TURNS = 10;
const DISCOVER_TOOLS_NAME = 'discover_tools';

let sdkModule = null;
async function loadSdk() {
  if (sdkModule) return sdkModule;
  sdkModule = await import('@superdoc-dev/sdk');
  return sdkModule;
}

function cleanArgs(args) {
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
  const { doc, sessionId, ...rest } = args
  return rest;
}

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
    const roundTrip = vars.roundTrip === true || vars.roundTrip === 'true';
    const keepFile = vars.keepFile === true || vars.keepFile === 'true';
    const srcPath = resolve(FIXTURES_DIR, fixture);

    // Always work on a copy so the original fixture is never modified
    const tmpName = `tmp-${Date.now()}-${fixture}`;
    const docPath = resolve(FIXTURES_DIR, tmpName);
    copyFileSync(srcPath, docPath);

    // If keepFile, we'll copy the result to results/output/ after editing
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = fixture.replace(/\.docx$/i, '');
    const outputPath = keepFile ? resolve(OUTPUT_DIR, `${baseName}-${ts}.docx`) : null;
    if (keepFile) mkdirSync(OUTPUT_DIR, { recursive: true });

    // 1. Create client and open document
    let client;
    try {
      client = sdk.createSuperDocClient({
        startupTimeoutMs: 15_000,
        requestTimeoutMs: 30_000,
        watchdogTimeoutMs: 120_000,
      });
      await client.connect();
      await client.doc.open({ doc: docPath });
    } catch (err) {
      return { error: `Failed to open document: ${err.message}` };
    }

    // 2. Load essential tools
    const activeToolMap = new Map();
    try {
      const chosen = await sdk.chooseTools({ provider: 'openai' });
      for (const t of chosen.tools) {
        const name = t.function?.name;
        if (name) activeToolMap.set(name, t);
      }
    } catch (err) {
      await client.dispose().catch(() => {});
      return { error: `Failed to load tools: ${err.message}` };
    }

    // 3. Build messages
    const task = vars.task || prompt;
    const systemContent = SYSTEM_PROMPT.replace('{{task}}', task);
    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: task },
    ];

    // 4. Agent loop
    const openai = new OpenAI();
    const toolLog = [];

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await openai.chat.completions.create({
          model,
          messages,
          tools: [...activeToolMap.values()],
          temperature: 0,
        });

        const message = response.choices[0].message;
        messages.push(message);

        if (!message.tool_calls?.length) break;

        for (const call of message.tool_calls) {
          const toolName = call.function.name;
          let toolArgs;
          try {
            toolArgs = JSON.parse(call.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          let result;
          try {
            if (toolName === DISCOVER_TOOLS_NAME) {
              const groups = Array.isArray(toolArgs.groups) ? toolArgs.groups : [];
              const discovered = await sdk.chooseTools({
                provider: 'openai',
                groups,
                mode: 'essential',
                includeDiscoverTool: false,
              });
              let added = 0;
              for (const t of discovered.tools) {
                const name = t.function?.name;
                if (name && !activeToolMap.has(name)) {
                  activeToolMap.set(name, t);
                  added++;
                }
              }
              result = { ok: true, loaded: groups, newTools: added };
            } else {
              result = await sdk.dispatchSuperDocTool(client, toolName, cleanArgs(toolArgs));
            }
          } catch (err) {
            result = { ok: false, error: err.message };
          }

          toolLog.push({ tool: toolName, args: toolArgs, ok: !result?.error });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }
      }

      // 5. Get document text after edits
      const afterText = await client.doc.getText();

      let exportedText = null;

      if (roundTrip) {
        // 6. Save the document back to DOCX
        await client.doc.save();
        await client.doc.close().catch(() => {});
        await client.dispose().catch(() => {});

        // 7. Re-open the saved file and verify edits survived
        const client2 = sdk.createSuperDocClient({
          startupTimeoutMs: 15_000,
          requestTimeoutMs: 30_000,
          watchdogTimeoutMs: 120_000,
        });
        await client2.connect();
        await client2.doc.open({ doc: docPath });
        exportedText = await client2.doc.getText();
        await client2.doc.close().catch(() => {});
        await client2.dispose().catch(() => {});
      } else {
        await client.doc.close().catch(() => {});
        await client.dispose().catch(() => {});
      }

      // Copy to results/output/ if keepFile, then always clean up temp
      if (keepFile && outputPath) {
        // Save the document first if not already saved by roundTrip
        if (!roundTrip) await client.doc.save().catch(() => {});
        copyFileSync(docPath, outputPath);
      }
      unlinkSync(docPath);

      return {
        output: JSON.stringify({
          documentText: roundTrip ? exportedText : afterText,
          afterEditText: afterText,
          exportedText: exportedText,
          roundTrip: roundTrip,
          outputFile: outputPath,
          toolCalls: toolLog,
          turns: toolLog.length,
        }),
      };
    } catch (err) {
      try { unlinkSync(docPath); } catch {}
      await client.dispose().catch(() => {});
      return { error: `Agent loop failed: ${err.message}` };
    }
  }
}
