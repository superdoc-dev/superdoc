/**
 * Custom Promptfoo provider: OpenAI Codex SDK benchmark.
 *
 * Uses @openai/codex-sdk to run Codex against DOCX tasks.
 * API: new Codex(opts) -> codex.startThread(opts) -> thread.runStreamed(prompt)
 *
 * For SuperDoc conditions, the MCP server is launched through a stdio wrapper
 * that logs raw transport bytes for debugging protocol issues.
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

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
const MCP_WRAPPER_PATH = resolve(__dirname, 'mcp-stdio-wrapper.mjs');

const SUPERDOC_AGENTS_MD = `# AGENTS.md

You have a SuperDoc MCP server available. Use it for ALL .docx file operations.

**Do NOT** use unzip, python-docx, mammoth, sed, or manual XML editing on .docx files.
**Do** use the superdoc_* MCP tools: superdoc_open → superdoc_get_content/search/edit → superdoc_save → superdoc_close.

The SuperDoc tools handle OOXML format correctly and preserve document structure.
`;

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

    // Preflight: check MCP server artifact exists if needed
    if (this.config.superdocMcp && !existsSync(MCP_SERVER_PATH)) {
      return { error: `MCP server not built: ${MCP_SERVER_PATH}. Run: cd apps/mcp && pnpm run build` };
    }

    const { docPath, stateDir } = createTempCopy(fixture);
    mkdirSync(stateDir, { recursive: true });
    const localDocPath = resolve(stateDir, fixture);
    copyFileSync(docPath, localDocPath);
    const beforeText = extractDocxText(localDocPath);
    const startTime = performance.now();

    try {
      // Minimal env to prevent stray stdout from deps
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        NODE_ENV: 'production',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      };

      const codexOpts = {
        apiKey: process.env.OPENAI_API_KEY,
        // Auto-approve MCP tool calls (approval_policy=never only covers shell commands)
        config: {
          mcp_auto_approve: ['superdoc/*'],
        },
      };

      // Attach SuperDoc MCP server via stdio wrapper for transport debugging
      if (this.config.superdocMcp) {
        const mcpLogDir = resolve(stateDir, 'mcp-logs');
        mkdirSync(mcpLogDir, { recursive: true });

        codexOpts.config = {
          mcp_servers: {
            superdoc: {
              command: process.execPath, // Use exact node binary, not bare 'node'
              args: [MCP_WRAPPER_PATH, process.execPath, MCP_SERVER_PATH],
            },
          },
        };
        codexOpts.env = { ...env, LOGDIR: mcpLogDir };

        writeFileSync(resolve(stateDir, 'AGENTS.md'), SUPERDOC_AGENTS_MD);
      }

      const codex = new Codex(codexOpts);
      const thread = codex.startThread({
        workingDirectory: stateDir,
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
        sandboxMode: 'danger-full-access',
      });

      // Build prompt
      let fullPrompt = `The DOCX file is at: ${localDocPath}\nIf you edit the document, save the result back to the same file path.\n\n${task}`;
      if (this.config.superdocMcp) {
        fullPrompt += '\n\nIMPORTANT: Use the superdoc MCP tools (superdoc_open, superdoc_get_content, superdoc_edit, etc.) for this task. Do NOT use unzip or manual XML parsing.';
      }

      // Use runStreamed to capture full event lifecycle
      const { events } = await thread.runStreamed(fullPrompt);

      const toolCalls = [];
      let finalResponse = '';
      let usage = null;

      for await (const event of events) {
        if (event.type === 'item.completed') {
          const item = event.item;
          if (item.type === 'command_execution') {
            toolCalls.push({
              tool: 'Bash',
              args: { command: item.command },
              status: item.status,
            });
          } else if (item.type === 'mcp_tool_call') {
            toolCalls.push({
              tool: item.tool,
              server: item.server,
              args: item.arguments,
              status: item.status,
              error: item.error?.message || null,
              hasResult: !!item.result,
            });
          } else if (item.type === 'agent_message') {
            finalResponse = item.text;
          }
        } else if (event.type === 'turn.completed') {
          usage = event.usage;
        }
      }

      const duration = performance.now() - startTime;

      let afterText = extractDocxText(localDocPath);
      if (afterText === beforeText) {
        const altPath = findDocxInDir(stateDir);
        if (altPath && altPath !== localDocPath) afterText = extractDocxText(altPath);
      }

      const result = {
        output: JSON.stringify({
          agentResponseText: finalResponse,
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount: toolCalls.length,
          cost: 0,
          duration,
          usage: usage || {},
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
