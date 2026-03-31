/**
 * Custom Promptfoo provider: Claude Code agent benchmark.
 *
 * Uses @anthropic-ai/claude-agent-sdk to run Claude Code against DOCX tasks
 * under different conditions (baseline, vendor, superdoc-skill, superdoc-cli, choice).
 *
 * Config (set per provider instance in YAML):
 *   condition:        'baseline' | 'vendor' | 'superdoc-skill' | 'superdoc-cli' | 'choice'
 *   allowedTools:     Array of tool names Claude Code can use
 *   disallowedTools:  Array of tool names to block
 *   superdocOnPath:   Whether SuperDoc CLI is available on PATH
 *   superdocSkill:    Whether the SuperDoc skill is installed
 *   vendorSkill:      Whether vendor DOCX skill is available
 *
 * Vars (set per test):
 *   fixture:   DOCX filename in fixtures/
 *   task:      The user task prompt
 *   keepFile:  Save the edited DOCX to results/output/ (default: false)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  PATHS,
  cacheKey,
  cleanupTemp,
  createTempCopy,
  extractDocxText,
  readCache,
  writeCache,
} from './utils.mjs';

/** Detect which DOCX workflow the agent used based on tool names and bash args. */
function detectPathUsed(toolCalls) {
  const names = toolCalls.map(tc => tc.tool || '');
  const bashArgs = toolCalls
    .filter(tc => tc.tool === 'Bash')
    .map(tc => JSON.stringify(tc.args || {}));

  if (names.some(n => n.startsWith('superdoc_'))) return 'superdoc-skill';
  if (bashArgs.some(a => a.includes('superdoc '))) return 'superdoc-cli';
  if (names.some(n => n.includes('Skill'))) return 'vendor-skill';
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

    if (!fixture) {
      return { error: 'No fixture specified in test vars' };
    }

    // Cache key includes condition + model to avoid stale results
    const key = cacheKey(`cc-${this.config.condition}`, fixture, task, 'sonnet');
    const cached = readCache(key);
    if (cached) return cached;

    // Create isolated working copy
    const { docPath, stateDir, uid } = createTempCopy(fixture);
    const beforeText = extractDocxText(docPath);
    const startTime = performance.now();

    try {
      // Build PATH: include or exclude SuperDoc CLI
      const env = { ...process.env };
      if (!this.config.superdocOnPath) {
        env.PATH = env.PATH.split(':')
          .filter(p => !p.includes('superdoc'))
          .join(':');
      }

      // Run Claude Code via SDK
      let resultMessage = null;
      const toolCalls = [];
      let agentResponseText = '';

      for await (const message of query({
        prompt: `The DOCX file is at: ${docPath}\n\n${task}`,
        options: {
          model: 'sonnet',
          allowedTools: this.config.allowedTools,
          disallowedTools: this.config.disallowedTools,
          maxTurns: 20,
          maxBudgetUsd: 2.00,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          cwd: stateDir,
          env,
        },
      })) {
        // Capture agent text responses (for reading task validation)
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') agentResponseText += block.text + '\n';
          }
        }
        // Capture tool usage (for path detection)
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolCalls.push({ tool: block.name, args: block.input });
            }
          }
        }
        if (message.type === 'result') {
          resultMessage = message;
        }
      }

      // Extract document text AFTER agent runs
      const afterText = extractDocxText(docPath);
      const duration = performance.now() - startTime;

      const result = {
        output: JSON.stringify({
          agentResponseText: agentResponseText.trim(),
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount: resultMessage?.num_turns || 0,
          cost: resultMessage?.total_cost_usd || 0,
          usage: resultMessage?.usage || {},
          duration,
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
