/**
 * Custom Promptfoo provider: OpenAI Codex SDK benchmark.
 *
 * Uses @openai/codex-sdk to run Codex against DOCX tasks.
 * API: new Codex() -> codex.startThread(opts) -> thread.run(prompt)
 *
 * Config (set per provider instance in YAML):
 *   condition:      'baseline' | 'vendor' | 'superdoc-skill' | 'superdoc-cli' | 'choice'
 *   superdocOnPath: Whether SuperDoc CLI is available on PATH
 *
 * Vars (set per test):
 *   fixture:   DOCX filename in fixtures/
 *   task:      The user task prompt
 *   keepFile:  Save the edited DOCX (default: false)
 */

import { mkdirSync } from 'node:fs';
import { Codex } from '@openai/codex-sdk';
import {
  cacheKey,
  cleanupTemp,
  createTempCopy,
  extractDocxText,
  readCache,
  writeCache,
} from './utils.mjs';

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
    const beforeText = extractDocxText(docPath);
    const startTime = performance.now();

    try {
      // Codex SDK: new Codex() -> startThread(opts) -> thread.run(prompt)
      const codex = new Codex();
      const thread = codex.startThread({
        workingDirectory: stateDir,
        skipGitRepoCheck: true,
        approvalPolicy: 'never', // fully autonomous, no interactive prompts
      });

      const turn = await thread.run(`The DOCX file is at: ${docPath}\n\n${task}`);
      const duration = performance.now() - startTime;

      // Extract tool calls from turn items
      // Items are: command_execution, mcp_tool_call, file_change, etc.
      const toolCalls = (turn.items || [])
        .filter(item => item.type === 'command_execution' || item.type === 'mcp_tool_call')
        .map(item => {
          if (item.type === 'command_execution') {
            return { tool: 'Bash', args: { command: item.command } };
          }
          return { tool: item.tool, args: item.arguments };
        });

      const afterText = extractDocxText(docPath);

      const result = {
        output: JSON.stringify({
          agentResponseText: turn.finalResponse || '',
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount: toolCalls.length,
          cost: 0, // Codex SDK doesn't expose cost
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
