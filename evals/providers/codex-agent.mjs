/**
 * Custom Promptfoo provider: Codex agent benchmark.
 *
 * Uses @openai/codex-sdk to run Codex against DOCX tasks
 * under different conditions (baseline, vendor, superdoc-skill, superdoc-cli, choice).
 *
 * Config (set per provider instance in YAML):
 *   condition:      'baseline' | 'vendor' | 'superdoc-skill' | 'superdoc-cli' | 'choice'
 *   superdocOnPath: Whether SuperDoc CLI is available on PATH
 *
 * Vars (set per test):
 *   fixture:   DOCX filename in fixtures/
 *   task:      The user task prompt
 *   keepFile:  Save the edited DOCX to results/output/ (default: false)
 */

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
    const beforeText = extractDocxText(docPath);
    const startTime = performance.now();

    try {
      const env = { ...process.env };
      if (!this.config.superdocOnPath) {
        env.PATH = env.PATH.split(':')
          .filter(p => !p.includes('superdoc'))
          .join(':');
      }

      // Run via Codex SDK
      const codex = new Codex({ env });
      const thread = codex.startThread({
        workingDirectory: stateDir,
        skipGitRepoCheck: true,
      });

      const turn = await thread.run(`The DOCX file is at: ${docPath}\n\n${task}`);
      const duration = performance.now() - startTime;

      // Extract tool calls from turn items
      const toolCalls = (turn.items || [])
        .filter(item => item.type === 'tool_call' || item.type === 'function_call')
        .map(item => ({
          tool: item.name || item.tool,
          args: item.arguments || item.input,
        }));

      const afterText = extractDocxText(docPath);

      const result = {
        output: JSON.stringify({
          agentResponseText: turn.finalResponse || '',
          documentText: afterText,
          documentChanged: beforeText !== afterText,
          condition: this.config.condition,
          toolCalls,
          stepCount: toolCalls.length,
          cost: 0, // Codex SDK doesn't expose cost directly
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
