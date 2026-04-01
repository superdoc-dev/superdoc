/**
 * Custom Promptfoo provider: OpenAI Codex SDK benchmark.
 *
 * Uses @openai/codex-sdk to run Codex against DOCX tasks.
 * API: new Codex(opts) -> codex.startThread(opts) -> thread.run(prompt)
 *
 * For SuperDoc conditions, the SuperDoc MCP server is registered via
 * Codex's config system (mcp_servers in config.toml format).
 *
 * Config (set per provider instance in YAML):
 *   condition:      'baseline' | 'vendor' | 'superdoc-skill' | 'superdoc-cli' | 'choice'
 *   superdocOnPath: Whether SuperDoc CLI is available on PATH
 *   superdocMcp:    Whether to attach the SuperDoc MCP server
 *
 * Vars (set per test):
 *   fixture:   DOCX filename in fixtures/
 *   task:      The user task prompt
 *   keepFile:  Save the edited DOCX (default: false)
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Codex } from '@openai/codex-sdk';
import {
  cacheKey,
  cleanupTemp,
  createTempCopy,
  extractDocxText,
  readCache,
  writeCache,
} from './utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = resolve(__dirname, '../../apps/mcp/dist/index.js');

/** Find the newest .docx file in a directory (agent may write output here). */
function findDocxInDir(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.docx'))
    .map(f => ({ path: resolve(dir, f), mtime: statSync(resolve(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

/** Detect which DOCX workflow the agent used based on tool calls. */
function detectPathUsed(toolCalls) {
  const names = toolCalls.map(tc => tc.tool || '');
  const allArgs = toolCalls.map(tc => JSON.stringify(tc.args || {}));

  if (names.some(n => n.startsWith('superdoc_'))) return 'superdoc-skill';
  if (allArgs.some(a => a.includes('superdoc '))) return 'superdoc-cli';
  if (allArgs.some(a =>
    a.includes('python-docx') || a.includes('mammoth') || a.includes('docx')
  )) return 'raw';
  if (allArgs.some(a => a.includes('.docx'))) return 'raw';
  return 'none';
}

export default class CodexBenchmarkProvider {
  constructor(options) {
    this.config = options.config || {};
  }

  id() {
    return `codex-${this.config.condition || 'baseline'}`;
  }

  async callApi(prompt, context) {
    const vars = context?.vars || {};
    const fixture = vars.fixture;
    const task = vars.task || prompt;
    const keepFile = vars.keepFile === true || vars.keepFile === 'true';

    if (!fixture) {
      return { error: 'No fixture specified in test vars' };
    }

    const key = cacheKey(`codex-${this.config.condition}`, fixture, task, 'o3');
    const cached = readCache(key);
    if (cached) return cached;

    const { docPath, stateDir } = createTempCopy(fixture);
    mkdirSync(stateDir, { recursive: true });
    // Copy fixture into stateDir so it's within Codex's writable sandbox
    const localDocPath = resolve(stateDir, fixture);
    copyFileSync(docPath, localDocPath);
    const beforeText = extractDocxText(localDocPath);
    const startTime = performance.now();

    try {
      // Build Codex options
      const codexOpts = {};

      // Attach SuperDoc MCP server for superdoc conditions
      if (this.config.superdocMcp) {
        codexOpts.config = {
          mcp_servers: {
            superdoc: {
              command: 'node',
              args: [MCP_SERVER_PATH],
            },
          },
        };
      }

      const codex = new Codex(codexOpts);
      const thread = codex.startThread({
        workingDirectory: stateDir,
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
      });

      const fullPrompt = `The DOCX file is at: ${localDocPath}\nIf you edit the document, save the result back to the same file path.\n\n${task}`;
      const turn = await thread.run(fullPrompt);
      const duration = performance.now() - startTime;

      // Extract tool calls from turn items:
      //   command_execution = shell commands (Bash)
      //   mcp_tool_call     = MCP tool invocations (SuperDoc tools)
      const toolCalls = (turn.items || [])
        .filter(item => item.type === 'command_execution' || item.type === 'mcp_tool_call')
        .map(item => {
          if (item.type === 'command_execution') {
            return { tool: 'Bash', args: { command: item.command } };
          }
          return { tool: item.tool, args: item.arguments };
        });

      let afterText = extractDocxText(localDocPath);
      if (afterText === beforeText) {
        const altPath = findDocxInDir(stateDir);
        if (altPath && altPath !== localDocPath) afterText = extractDocxText(altPath);
      }

      const result = {
        output: JSON.stringify({
          agentResponseText: turn.finalResponse || '',
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount: toolCalls.length,
          cost: 0,
          duration,
          usage: turn.usage || {},
          pathUsed: detectPathUsed(toolCalls),
          outputFile: keepFile ? docPath : null,
        }),
      };

      writeCache(key, result);
      return result;
    } catch (err) {
      return { error: err.message };
    } finally {
      if (!keepFile) cleanupTemp(docPath, stateDir);
    }
  }
}
