/**
 * Custom Promptfoo provider: OpenAI Codex SDK benchmark.
 *
 * Uses @openai/codex-sdk to run Codex against DOCX tasks.
 * API: new Codex(opts) -> codex.startThread(opts) -> thread.runStreamed(prompt)
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
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PATHS,
  buildFileInstruction,
  buildResult,
  cacheKey,
  cleanupTemp,
  collectMetrics,
  installSkillAndCli,
  loadMcpSystemPrompt,
  performance,
  preflightCheck,
  readCache,
  setupWorkDir,
} from '../shared/agent-harness.mjs';

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

    const preflight = preflightCheck(this.config);
    if (preflight) return preflight;

    const { docPath, stateDir, localDocPath, beforeText } = setupWorkDir(vars);
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

      installSkillAndCli(this.config, stateDir, env, 'AGENTS.md');

      const codexOpts = {
        apiKey: process.env.OPENAI_API_KEY,
        config: {
          mcp_auto_approve: ['superdoc/*'],
        },
      };

      // Attach SuperDoc MCP server via stdio wrapper for transport debugging
      if (this.config.superdocMcp) {
        const mcpLogDir = resolve(stateDir, 'mcp-logs');
        mkdirSync(mcpLogDir, { recursive: true });

        codexOpts.config = {
          ...codexOpts.config,
          mcp_servers: {
            superdoc: {
              command: process.execPath,
              args: [PATHS.mcpWrapper, process.execPath, PATHS.mcpServer],
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
      const fileInstruction = buildFileInstruction(localDocPath, blankDocument);
      let fullPrompt = `${fileInstruction}\n\n${task}`;
      if (this.config.superdocMcp) {
        fullPrompt += '\n\nIMPORTANT: Use the superdoc MCP tools (superdoc_open, superdoc_get_content, superdoc_edit, etc.) for this task. Do NOT use unzip or manual XML parsing.';
      } else if (this.config.superdocOnPath) {
        fullPrompt += '\n\nIMPORTANT: A `superdoc` CLI is available on PATH for working with .docx files. Use `superdoc --help` to see commands. Use the superdoc CLI instead of unzip or manual XML parsing.';
      }

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

      const metrics = collectMetrics({ localDocPath, stateDir, beforeText, startTime, toolCalls, extra: { usage: usage || {} } });

      return buildResult({
        config: this.config,
        agentResponseText: finalResponse,
        afterText: metrics.afterText,
        beforeText,
        toolCalls,
        metrics,
        extra: {
          stepCount: toolCalls.length,
          cost: 0,
          usage: usage || {},
        },
        keepFile,
        localDocPath,
        cacheKeyStr: key,
      });
    } catch (err) {
      return { error: err.message };
    } finally {
      if (!keepFile) cleanupTemp(docPath, stateDir);
    }
  }
}
