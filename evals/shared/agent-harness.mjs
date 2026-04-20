/**
 * Shared harness logic for benchmark providers (Claude Code + Codex).
 *
 * Handles: path constants, doc setup, vendor skill / CLI installation,
 * prompt building, post-execution metrics, result formatting, cleanup.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  cacheKey,
  cleanupTemp,
  createTempCopy,
  extractDocxText,
  readCache,
  writeCache,
} from './provider-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');

export const PATHS = {
  mcpServer: resolve(EVALS_ROOT, '../apps/mcp/dist/index.js'),
  mcpSystemPrompt: resolve(EVALS_ROOT, '../packages/sdk/tools/system-prompt-mcp.md'),
  cli: resolve(EVALS_ROOT, '../apps/cli/dist/index.js'),
  vendorSkill: resolve(EVALS_ROOT, 'fixtures/vendor/vendor-docx-skill.md'),
  mcpWrapper: resolve(EVALS_ROOT, 'providers/mcp-stdio-wrapper.mjs'),
};

/** Load the generated MCP system prompt (single source of truth). */
export function loadMcpSystemPrompt() {
  if (existsSync(PATHS.mcpSystemPrompt)) {
    return readFileSync(PATHS.mcpSystemPrompt, 'utf8');
  }
  throw new Error(`MCP system prompt not found: ${PATHS.mcpSystemPrompt}. Run: pnpm run generate:all`);
}

export const SUPERDOC_CLI_AGENTS_MD = `# AGENTS.md

A \`superdoc\` CLI is available on PATH for working with .docx files.
You MUST use \`superdoc\` command. Run \`superdoc --help\` to see available commands.
**Do NOT** use unzip, python-docx, mammoth, sed, or manual XML editing on .docx files.

Common commands:
- \`superdoc get-text <file.docx>\` — extract plain text
- \`superdoc get-markdown <file.docx>\` — extract as markdown
- \`superdoc find <file.docx> --select.type=text --select.pattern="search term"\` — search
- \`superdoc --help\` — list all commands

The superdoc CLI handles OOXML format correctly and preserves document structure.
`;

/**
 * Find the newest .docx file in a directory (agent may write output there).
 * Returns the path or null.
 */
export function findDocxInDir(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.docx'))
    .map(f => ({ path: resolve(dir, f), mtime: statSync(resolve(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

/** Detect which DOCX workflow the agent used based on tool calls. */
export function detectPathUsed(toolCalls) {
  const names = toolCalls.map(tc => tc.tool || '');
  const allArgs = toolCalls.map(tc => JSON.stringify(tc.args || {}));

  if (names.some(n => n.startsWith('superdoc_') || n.startsWith('mcp__superdoc'))) return 'superdoc-mcp';
  if (allArgs.some(a => a.includes('superdoc '))) return 'superdoc-cli';
  if (names.some(n => n.includes('Skill'))) return 'baseline-with-docx-skill';
  if (allArgs.some(a =>
    a.includes('python-docx') || a.includes('mammoth') || a.includes('docx')
  )) return 'raw';
  if (allArgs.some(a => a.includes('.docx'))) return 'raw';
  return 'none';
}

/**
 * Preflight checks — fail fast if required build artifacts are missing.
 * Returns an error object or null.
 */
export function preflightCheck(config) {
  if (config.superdocMcp && !existsSync(PATHS.mcpServer)) {
    return { error: `MCP server not built: ${PATHS.mcpServer}. Run: cd apps/mcp && pnpm run build` };
  }
  if (config.superdocOnPath && !config.superdocMcp && !existsSync(PATHS.cli)) {
    return { error: `CLI not built: ${PATHS.cli}. Run: cd apps/cli && pnpm run build` };
  }
  return null;
}

/**
 * Set up the working directory: copy fixture (or create blank dir),
 * extract before-text for diffing.
 *
 * Returns { docPath, stateDir, localDocPath, beforeText }.
 */
export function setupWorkDir(vars) {
  const fixture = vars.fixture;
  const blankDocument = vars.blankDocument === true || vars.blankDocument === 'true';

  if (blankDocument) {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const stateDir = resolve(EVALS_ROOT, 'fixtures', `.state-${uid}`);
    mkdirSync(stateDir, { recursive: true });
    const outputName = vars.outputName || 'document.docx';
    const localDocPath = resolve(stateDir, outputName);
    return { docPath: localDocPath, stateDir, localDocPath, beforeText: '' };
  }

  const { docPath, stateDir } = createTempCopy(fixture);
  mkdirSync(stateDir, { recursive: true });
  const localDocPath = resolve(stateDir, fixture);
  copyFileSync(docPath, localDocPath);
  const beforeText = extractDocxText(localDocPath);
  return { docPath, stateDir, localDocPath, beforeText };
}

/**
 * Install vendor skill and/or CLI shim into the state directory.
 * Mutates `env` to update PATH when the CLI is installed.
 *
 * @param {object} config - Provider config
 * @param {string} stateDir - Working directory
 * @param {object} env - Environment variables (mutated in place)
 * @param {string} agentsMdName - Filename for the agent instructions ('CLAUDE.md' or 'AGENTS.md')
 */
export function installSkillAndCli(config, stateDir, env, agentsMdName) {
  if (config.vendorSkill && existsSync(PATHS.vendorSkill)) {
    writeFileSync(resolve(stateDir, agentsMdName), readFileSync(PATHS.vendorSkill, 'utf8'));
  }

  if (config.superdocOnPath && existsSync(PATHS.cli)) {
    const binDir = resolve(stateDir, 'bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      resolve(binDir, 'superdoc'),
      `#!/bin/sh\nexec "${process.execPath}" "${PATHS.cli}" "$@"\n`,
      { mode: 0o755 },
    );
    env.PATH = `${binDir}${delimiter}${env.PATH || ''}`;

    if (!config.superdocMcp) {
      writeFileSync(resolve(stateDir, agentsMdName), SUPERDOC_CLI_AGENTS_MD);
    }
  }
}

/**
 * Build the file instruction prefix for the agent prompt.
 */
export function buildFileInstruction(localDocPath, blankDocument) {
  return blankDocument
    ? `Create a new DOCX file at: ${localDocPath}\nUse superdoc_open with this exact path to create a blank document, then build the content.`
    : `The DOCX file is at: ${localDocPath}\nIf you edit the document, save the result back to the same file path.`;
}

/**
 * Collect post-execution metrics: after-text, duration, path detection, summary.
 */
export function collectMetrics({ localDocPath, stateDir, beforeText, startTime, toolCalls, extra }) {
  let afterText = extractDocxText(localDocPath);
  if (afterText === beforeText) {
    const altPath = findDocxInDir(stateDir);
    if (altPath && altPath !== localDocPath) afterText = extractDocxText(altPath);
  }

  const duration = performance.now() - startTime;
  const pathUsed = detectPathUsed(toolCalls);
  const secs = Math.round(duration / 1000);
  const usage = extra.usage || {};
  const inK = Math.round((usage.input_tokens || 0) / 1000);
  const outK = Math.round((usage.output_tokens || 0) / 1000);

  return { afterText, duration, pathUsed, secs, inK, outK };
}

/**
 * Format and cache the final result object.
 */
export function buildResult({ config, agentResponseText, afterText, beforeText, toolCalls, metrics, extra, keepFile, localDocPath, cacheKeyStr }) {
  const { pathUsed, secs, inK, outK, duration } = metrics;
  const stepCount = extra.stepCount ?? toolCalls.length;
  const cost = extra.cost ?? 0;
  const costStr = cost ? ` | $${cost.toFixed(4)}` : '';

  const result = {
    output: JSON.stringify({
      _summary: `${pathUsed} | ${stepCount} steps | ${secs}s | ${inK}k in + ${outK}k out${costStr}`,
      agentResponseText: agentResponseText.trim(),
      documentText: afterText,
      documentChanged: beforeText !== afterText,
      condition: config.condition,
      toolCalls,
      stepCount,
      cost,
      usage: extra.usage || {},
      duration,
      pathUsed,
      outputFile: keepFile ? localDocPath : null,
    }),
  };

  writeCache(cacheKeyStr, result);
  return result;
}

export { cacheKey, cleanupTemp, readCache, performance };
