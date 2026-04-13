/**
 * Custom Promptfoo provider: Claude Agent SDK benchmark.
 *
 * Uses @anthropic-ai/claude-agent-sdk query() — the SDK handles the full
 * agent loop with built-in tools (Bash, Read, Write, Edit, Glob, Grep).
 *
 * Config (set per provider instance in YAML):
 *   condition:          'baseline' | 'baseline-with-docx-skill' | 'superdoc-mcp' | 'superdoc-cli' | 'choice'
 *   allowedTools:       Array of built-in tool names the agent can use
 *   disallowedTools:    Array of tool names to block
 *   superdocOnPath:     Whether SuperDoc CLI is available on PATH
 *   superdocMcp:        Whether to attach the SuperDoc MCP server directly
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
import { existsSync, readFileSync } from 'node:fs';
import { delimiter } from 'node:path';
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

    const preflight = preflightCheck(this.config);
    if (preflight) return preflight;

    const model = this.config.model || 'sonnet';
    const key = cacheKey(`cc-${this.config.condition}`, fixture || 'blank', task, model);
    const cached = readCache(key);
    if (cached) return cached;

    const { docPath, stateDir, localDocPath, beforeText } = setupWorkDir(vars);
    const startTime = performance.now();

    try {
      const env = { ...process.env };
      env.ENABLE_TOOL_SEARCH = 'auto:5';
      if (!this.config.superdocOnPath) {
        env.PATH = (env.PATH ?? '').split(delimiter)
          .filter(p => !p.includes('superdoc'))
          .join(delimiter);
      }

      installSkillAndCli(this.config, stateDir, env, 'CLAUDE.md');

      // Build query options
      // IMPORTANT: Do NOT set settingSources — it loads ALL user MCP servers
      // (Linear, Excalidraw, Gmail, etc.) which adds ~4000 tokens per turn.
      const claudeMdPath = resolve(stateDir, 'CLAUDE.md');
      const claudeMdContent = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';

      const queryOptions = {
        model,
        allowedTools: this.config.allowedTools || ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
        disallowedTools: this.config.disallowedTools,
        maxTurns: this.config.maxTurns || 35,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: [],
        cwd: stateDir,
        env,
      };

      if (this.config.superdocMcp) {
        queryOptions.mcpServers = {
          superdoc: { command: 'node', args: [PATHS.mcpServer] },
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

      const toolCalls = [];
      let agentResponseText = '';
      let resultMessage = null;

      const fileInstruction = buildFileInstruction(localDocPath, blankDocument);
      const fullPrompt = `${fileInstruction}\n\n${task}`;

      for await (const message of query({
        prompt: fullPrompt,
        options: queryOptions,
      })) {
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

      const usage = resultMessage?.usage || {};
      const metrics = collectMetrics({ localDocPath, stateDir, beforeText, startTime, toolCalls, extra: { usage } });

      return buildResult({
        config: this.config,
        agentResponseText,
        afterText: metrics.afterText,
        beforeText,
        toolCalls,
        metrics,
        extra: {
          stepCount: resultMessage?.num_turns || 0,
          cost: resultMessage?.total_cost_usd || 0,
          usage,
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
