/**
 * Custom Promptfoo provider: Claude Agent SDK benchmark.
 *
 * Uses @anthropic-ai/claude-agent-sdk query() — the SDK handles the full
 * agent loop with built-in tools (Bash, Read, Write, Edit, Glob, Grep).
 *
 * For SuperDoc conditions, either:
 *   - superdocMcp: true   → attaches the SuperDoc MCP server directly
 *   - useClaudeSettings: true → inherits your local Claude Code config
 *     (MCP servers, skills, CLAUDE.md) via settingSources
 *
 * Config (set per provider instance in YAML):
 *   condition:          'baseline' | 'baseline-with-docx-skill' | 'superdoc-mcp' | 'superdoc-cli' | 'choice'
 *   allowedTools:       Array of built-in tool names the agent can use
 *   disallowedTools:    Array of tool names to block
 *   superdocOnPath:     Whether SuperDoc CLI is available on PATH
 *   superdocMcp:        Whether to attach the SuperDoc MCP server directly
 *   useClaudeSettings:  Whether to load your local Claude Code settings
 *                       (MCP servers, skills, CLAUDE.md from user + project)
 *   model:              Model to use (default: 'sonnet')
 *   maxTurns:           Max agent turns (default: 20)
 *   systemPrompt:       Optional system prompt override
 *
 * Vars (set per test):
 *   fixture:   DOCX filename in fixtures/
 *   task:      The user task prompt
 *   keepFile:  Save the edited DOCX (default: false)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
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
const MCP_SYSTEM_PROMPT_PATH = resolve(__dirname, '../../packages/sdk/tools/system-prompt-mcp.md');
const CLI_PATH = resolve(__dirname, '../../apps/cli/dist/index.js');
const VENDOR_SKILL_PATH = resolve(__dirname, '../fixtures/vendor/vendor-docx-skill.md');

// Load the generated MCP system prompt (single source of truth)
function loadMcpSystemPrompt() {
  if (existsSync(MCP_SYSTEM_PROMPT_PATH)) {
    return readFileSync(MCP_SYSTEM_PROMPT_PATH, 'utf8');
  }
  throw new Error(`MCP system prompt not found: ${MCP_SYSTEM_PROMPT_PATH}. Run: pnpm run generate:all`);
}

const SUPERDOC_CLI_AGENTS_MD = `# AGENTS.md

A \`superdoc\` CLI is available on PATH for working with .docx files.
You MUST use \`superdoc\` command. Run \`superdoc --help\` to see available commands.
**Do NOT** use unzip, python-docx, mammoth, sed, or manual XML editing on .docx files.

Common commands:
- \`superdoc get-text <file.docx>\` — extract plain text
- \`superdoc get-markdown <file.docx>\` — extract as markdown
- \`superdoc find <file.docx> --select.type=text --select.pattern="search term"\` — search
- \`superdoc --help\` — list all commands
`;

/**
 * Find a .docx file the agent may have written in a directory.
 * Returns the path to the newest .docx file, or null if none found.
 */
function findDocxInDir(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.docx'))
    .map(f => ({ path: resolve(dir, f), mtime: statSync(resolve(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

/** Detect which DOCX workflow the agent used based on tool names and bash args. */
function detectPathUsed(toolCalls) {
  const names = toolCalls.map(tc => tc.tool || '');
  const bashArgs = toolCalls
    .filter(tc => tc.tool === 'Bash')
    .map(tc => JSON.stringify(tc.args || {}));

  if (names.some(n => n.startsWith('superdoc_') || n.startsWith('mcp__superdoc'))) return 'superdoc-mcp';
  if (bashArgs.some(a => a.includes('superdoc '))) return 'superdoc-cli';
  if (names.some(n => n.includes('Skill'))) return 'baseline-with-docx-skill';
  if (bashArgs.some(a =>
    a.includes('python-docx') || a.includes('mammoth') || a.includes('docx')
  )) return 'raw';
  if (bashArgs.some(a => a.includes('.docx'))) return 'raw';
  return 'none';
}

export default class ClaudeCodeBenchmarkProvider {
  constructor(options) {
    this.config = options.config || {};
  }

  id() {
    return `claude-code-${this.config.condition || 'baseline'}`;
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

    // Preflight: fail fast if required artifacts are not built
    if (this.config.superdocMcp && !existsSync(MCP_SERVER_PATH)) {
      return { error: `MCP server not built: ${MCP_SERVER_PATH}. Run: cd apps/mcp && pnpm run build` };
    }
    if (this.config.superdocOnPath && !this.config.superdocMcp && !existsSync(CLI_PATH)) {
      return { error: `CLI not built: ${CLI_PATH}. Run: cd apps/cli && pnpm run build` };
    }

    const model = this.config.model || 'sonnet';
    const key = cacheKey(`cc-${this.config.condition}`, fixture || 'blank', task, model);
    const cached = readCache(key);
    if (cached) return cached;

    let docPath, stateDir, localDocPath, beforeText;

    if (blankDocument) {
      // Create from scratch: empty stateDir, agent creates the file via MCP
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
      const env = { ...process.env };
      env.ENABLE_TOOL_SEARCH = 'auto:5';
      if (!this.config.superdocOnPath) {
        env.PATH = env.PATH.split(':')
          .filter(p => !p.includes('superdoc'))
          .join(':');
      }

      // Install vendor DOCX skill as CLAUDE.md (Claude reads CLAUDE.md, not AGENTS.md)
      if (this.config.vendorSkill && existsSync(VENDOR_SKILL_PATH)) {
        writeFileSync(resolve(stateDir, 'CLAUDE.md'), readFileSync(VENDOR_SKILL_PATH, 'utf8'));
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

        if (!this.config.superdocMcp) {
          writeFileSync(resolve(stateDir, 'CLAUDE.md'), SUPERDOC_CLI_AGENTS_MD);
        }
      }

      // Build query options
      // IMPORTANT: Do NOT set settingSources — it loads ALL user MCP servers
      // (Linear, Excalidraw, Gmail, etc.) which adds ~4000 tokens per turn.
      // Instead, pass CLAUDE.md content as systemPrompt directly.
      const claudeMdPath = resolve(stateDir, 'CLAUDE.md');
      const claudeMdContent = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';

      const queryOptions = {
        model,
        allowedTools: this.config.allowedTools || ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
        disallowedTools: this.config.disallowedTools,
        maxTurns: this.config.maxTurns || 35,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: [], // SDK isolation mode: don't load user MCP servers (Linear, Excalidraw, etc.)
        cwd: stateDir,
        env,
      };

      // Attach SuperDoc MCP server directly (standalone, no user config loaded)
      if (this.config.superdocMcp) {
        queryOptions.mcpServers = {
          superdoc: { command: 'node', args: [MCP_SERVER_PATH] },
        };
        queryOptions.allowedTools = [
          ...(queryOptions.allowedTools || []),
          'mcp__superdoc__*',
        ];
      }

      // Build system prompt: combine MCP instructions + CLAUDE.md content
      const promptParts = [];
      if (this.config.superdocMcp) promptParts.push(loadMcpSystemPrompt());
      if (claudeMdContent) promptParts.push(claudeMdContent);
      if (this.config.systemPrompt) promptParts.push(this.config.systemPrompt);
      if (promptParts.length > 0) {
        queryOptions.systemPrompt = promptParts.join('\n\n');
      }

      let resultMessage = null;
      const toolCalls = [];
      let agentResponseText = '';

      const fileInstruction = blankDocument
        ? `Create a new DOCX file at: ${localDocPath}\nUse superdoc_open with this exact path to create a blank document, then build the content.`
        : `The DOCX file is at: ${localDocPath}\nIf you edit the document, save the result back to the same file path.`;
      const fullPrompt = `${fileInstruction}\n\n${task}`;

      for await (const message of query({
        prompt: fullPrompt,
        options: queryOptions,
      })) {
        console.log(message);
        
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') agentResponseText += block.text + '\n';
            if (block.type === 'tool_use') toolCalls.push({ tool: block.name, args: block.input });
          }
        }
        if (message.type === 'result') {
          resultMessage = message;
        }
      }

      let afterText = extractDocxText(localDocPath);
      if (afterText === beforeText) {
        const altPath = findDocxInDir(stateDir);
        if (altPath && altPath !== localDocPath) afterText = extractDocxText(altPath);
      }
      const duration = performance.now() - startTime;

      const pathUsed = detectPathUsed(toolCalls);
      const stepCount = resultMessage?.num_turns || 0;
      const cost = resultMessage?.total_cost_usd || 0;
      const usage = resultMessage?.usage || {};
      const secs = Math.round(duration / 1000);
      const inK = Math.round((usage.input_tokens || 0) / 1000);
      const outK = Math.round((usage.output_tokens || 0) / 1000);

      const result = {
        output: JSON.stringify({
          _summary: `${pathUsed} | ${stepCount} steps | ${secs}s | ${inK}k in + ${outK}k out | $${cost.toFixed(4)}`,
          agentResponseText: agentResponseText.trim(),
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount,
          cost,
          usage,
          duration,
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
