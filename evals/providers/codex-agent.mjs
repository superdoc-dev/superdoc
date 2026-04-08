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
 *   condition:      'baseline' | 'baseline-with-docx-skill' | 'superdoc-mcp' | 'superdoc-cli' | 'choice'
 *   superdocOnPath: Whether SuperDoc CLI is available on PATH
 *   superdocMcp:    Whether to attach the SuperDoc MCP server
 *
 * Vars (set per test):
 *   fixture:   DOCX filename in fixtures/
 *   task:      The user task prompt
 *   keepFile:  Save the edited DOCX (default: false)
 */

import { Codex } from '@openai/codex-sdk';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  cacheKey,
  cleanupTemp,
  createTempCopy,
  extractDocxText,
  readCache,
  writeCache,
} from '../shared/provider-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = resolve(__dirname, '../../apps/mcp/dist/index.js');
const MCP_WRAPPER_PATH = resolve(__dirname, 'mcp-stdio-wrapper.mjs');
const CLI_PATH = resolve(__dirname, '../../apps/cli/dist/index.js');
const VENDOR_SKILL_PATH = resolve(__dirname, '../fixtures/vendor/vendor-docx-skill.md');
const MCP_SYSTEM_PROMPT_PATH = resolve(__dirname, '../../packages/sdk/tools/system-prompt-mcp.md');

// Load the generated MCP system prompt (single source of truth)
function loadMcpSystemPrompt() {
  if (existsSync(MCP_SYSTEM_PROMPT_PATH)) {
    return readFileSync(MCP_SYSTEM_PROMPT_PATH, 'utf8');
  }
  throw new Error(`MCP system prompt not found: ${MCP_SYSTEM_PROMPT_PATH}. Run: pnpm run generate:all`);
}

const SUPERDOC_CLI_AGENTS_MD = `# AGENTS.md

A \`superdoc\` CLI is available on PATH for working with .docx files.

**Do NOT** use unzip, python-docx, mammoth, sed, or manual XML editing on .docx files.
**Do** use the \`superdoc\` command. Run \`superdoc --help\` to see available commands.

Common commands:
- \`superdoc get-text <file.docx>\` — extract plain text
- \`superdoc get-markdown <file.docx>\` — extract as markdown
- \`superdoc find <file.docx> --select.type=text --select.pattern="search term"\` — search
- \`superdoc --help\` — list all commands

The superdoc CLI handles OOXML format correctly and preserves document structure.
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

  if (names.some(n => n.startsWith('superdoc_'))) return 'superdoc-mcp';
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

    const blankDocument = vars.blankDocument === true || vars.blankDocument === 'true';

    if (!fixture && !blankDocument) {
      return { error: 'No fixture specified in test vars' };
    }

    const key = cacheKey(`codex-${this.config.condition}`, fixture || 'blank', task, 'o3');
    const cached = readCache(key);
    if (cached) return cached;

    // Preflight: fail fast if required artifacts are not built
    if (this.config.superdocMcp && !existsSync(MCP_SERVER_PATH)) {
      return { error: `MCP server not built: ${MCP_SERVER_PATH}. Run: cd apps/mcp && pnpm run build` };
    }
    if (this.config.superdocOnPath && !existsSync(CLI_PATH)) {
      return { error: `CLI not built: ${CLI_PATH}. Run: cd apps/cli && pnpm run build` };
    }

    let docPath, stateDir, localDocPath, beforeText;

    if (blankDocument) {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      stateDir = resolve(__dirname, '../fixtures', `.state-${uid}`);
      mkdirSync(stateDir, { recursive: true });
      const outputName = vars.outputName || 'document.docx';
      localDocPath = resolve(stateDir, outputName);
      docPath = localDocPath;
      beforeText = '';
    } else {
      ({ docPath, stateDir } = createTempCopy(fixture));
      mkdirSync(stateDir, { recursive: true });
      localDocPath = resolve(stateDir, fixture);
      copyFileSync(docPath, localDocPath);
      beforeText = extractDocxText(localDocPath);
    }
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
        ENABLE_TOOL_SEARCH: 'auto:5',
      };

      // Install vendor DOCX skill (Anthropic's docx skill) as AGENTS.md
      if (this.config.vendorSkill && existsSync(VENDOR_SKILL_PATH)) {
        writeFileSync(resolve(stateDir, 'AGENTS.md'), readFileSync(VENDOR_SKILL_PATH, 'utf8'));
      }

      // Put `superdoc` CLI on PATH as an actual executable
      if (this.config.superdocOnPath && existsSync(CLI_PATH)) {
        const binDir = resolve(stateDir, 'bin');
        mkdirSync(binDir, { recursive: true });
        writeFileSync(
          resolve(binDir, 'superdoc'),
          `#!/bin/sh\nexec "${process.execPath}" "${CLI_PATH}" "$@"\n`,
          { mode: 0o755 },
        );
        env.PATH = `${binDir}:${env.PATH}`;

        // Write AGENTS.md for CLI discovery (only if MCP isn't also attached)
        if (!this.config.superdocMcp) {
          writeFileSync(resolve(stateDir, 'AGENTS.md'), SUPERDOC_CLI_AGENTS_MD);
        }
      }

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

        writeFileSync(resolve(stateDir, 'AGENTS.md'), loadMcpSystemPrompt());
      }

      const codex = new Codex(codexOpts);
      const thread = codex.startThread({
        workingDirectory: stateDir,
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
        sandboxMode: 'danger-full-access',
      });

      // Build prompt
      const fileInstruction = blankDocument
        ? `Create a new DOCX file at: ${localDocPath}\nUse superdoc_open with this exact path to create a blank document, then build the content.`
        : `The DOCX file is at: ${localDocPath}\nIf you edit the document, save the result back to the same file path.`;
      let fullPrompt = `${fileInstruction}\n\n${task}`;
      if (this.config.superdocMcp) {
        fullPrompt += '\n\nIMPORTANT: Use the superdoc MCP tools (superdoc_open, superdoc_get_content, superdoc_edit, etc.) for this task. Do NOT use unzip or manual XML parsing.';
      } else if (this.config.superdocOnPath) {
        fullPrompt += '\n\nIMPORTANT: A `superdoc` CLI is available on PATH for working with .docx files. Use `superdoc --help` to see commands. Use the superdoc CLI instead of unzip or manual XML parsing.';
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

      const pathUsed = detectPathUsed(toolCalls);
      const stepCount = toolCalls.length;
      const secs = Math.round(duration / 1000);
      const inK = Math.round((usage?.input_tokens || 0) / 1000);
      const outK = Math.round((usage?.output_tokens || 0) / 1000);

      const result = {
        output: JSON.stringify({
          _summary: `${pathUsed} | ${stepCount} steps | ${secs}s | ${inK}k in + ${outK}k out`,
          agentResponseText: finalResponse,
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount,
          cost: 0,
          duration,
          usage: usage || {},
          pathUsed,
          outputFile: keepFile ? localDocPath : null,
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
