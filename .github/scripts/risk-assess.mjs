#!/usr/bin/env node
/**
 * Tiered AI Risk Assessment for PRs.
 *
 * Layer 1: File-path classifier (free, instant) — already run by risk-label.yml
 * Layer 2: Haiku triage (no tools, ~$0.008, ~2s) — classifies change type
 * Layer 3: Sonnet deep analysis (codebase tools, ~$0.10, ~60s) — blast radius
 *
 * Usage:
 *   node risk-assess.mjs <pr-number>
 *   node risk-assess.mjs <pr-number> --deep    # force Sonnet deep analysis
 *   node risk-assess.mjs <pr-number> --dry-run # assess but don't post comment
 *
 * Env:
 *   ANTHROPIC_API_KEY  — required
 *   GITHUB_TOKEN       — for fetching PR data via gh CLI
 *   REPO               — owner/repo (default: superdoc-dev/superdoc)
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Allow running inside a Claude Code session
delete process.env.CLAUDECODE;

const REPO = process.env.REPO || 'superdoc-dev/superdoc';

/** Extract the first valid JSON object containing "level" from text. */
function extractJSON(text) {
  // Try to find JSON between code fences first
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* continue */ }
  }

  // Find all { positions and try parsing from each one
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    // Find the matching closing brace by counting depth
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      if (depth === 0) {
        const candidate = text.slice(i, j + 1);
        if (candidate.includes('"level"')) {
          try { return JSON.parse(candidate); } catch { break; }
        }
        break;
      }
    }
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function getPRDiff(pr) {
  return run(`gh pr diff ${pr} --repo ${REPO}`);
}

function getPRFiles(pr) {
  return run(`gh pr diff ${pr} --repo ${REPO} --name-only`);
}

// ── Layer 1: File-path classification ────────────────────────────────────────

async function filePathClassify(files) {
  const { classify } = await import('./risk-label.mjs');
  return classify(files);
}

// ── Layer 2: Haiku triage ────────────────────────────────────────────────────

const HAIKU_TRIAGE_TOOL = {
  name: 'classify_risk',
  description: 'Classify the risk level of a PR based on the diff.',
  input_schema: {
    type: 'object',
    required: ['level', 'confidence', 'change_type', 'summary', 'needs_deep_analysis', 'reason_for_deep'],
    properties: {
      level: { type: 'string', enum: ['critical', 'sensitive', 'low'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      change_type: { type: 'string', enum: ['behavioral', 'additive', 'mechanical'] },
      summary: { type: 'string', description: 'One sentence summary of the change' },
      needs_deep_analysis: { type: 'boolean' },
      reason_for_deep: { type: 'string', description: 'Why deep analysis is or is not needed' },
    },
  },
};

function buildHaikuPrompt(files, diff) {
  const maxLines = 400;
  const lines = diff.split('\n');
  const usable = lines.length > maxLines
    ? lines.slice(0, maxLines).join('\n') + `\n\n... (${lines.length - maxLines} more lines truncated)`
    : diff;

  return `You are a fast code risk triager for SuperDoc (document editing/rendering library).

## Critical paths (rendering/layout can break):
- packages/layout-engine/ (style-engine, layout-engine, pm-adapter, layout-bridge, measuring, painters)
- packages/super-editor/src/core/super-converter/ (DOCX import/export)
- packages/super-editor/src/core/presentation-editor/ (editor↔layout bridge)
- packages/superdoc/src/core/ (main entry core)
- packages/word-layout/

## Sensitive paths (editing behavior):
- packages/super-editor/src/extensions/ and src/core/
- packages/superdoc/src/
- packages/layout-engine/contracts/
- packages/esign/, shared/

## Changed files:
${files}

## Diff:
\`\`\`diff
${usable}
\`\`\`

Classify this PR. Determine if changes are:
- **behavioral**: modify existing logic, change function signatures, alter control flow
- **additive**: new functions/files/tests, no existing behavior touched
- **mechanical**: renames, formatting, comments, type annotations only

Be conservative — when uncertain, classify higher. Use the classify_risk tool.`;
}

async function haikuTriage(pr, title, files, diff) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const start = Date.now();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        tools: [HAIKU_TRIAGE_TOOL],
        tool_choice: { type: 'tool', name: 'classify_risk' },
        messages: [{ role: 'user', content: buildHaikuPrompt(files, diff) }],
      });
      const durationMs = Date.now() - start;

      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (!toolBlock) {
        throw new Error('Haiku did not call classify_risk tool');
      }

      const cost = (response.usage.input_tokens * 0.80 + response.usage.output_tokens * 4.0) / 1_000_000;
      return { ...toolBlock.input, cost, durationMs };
    } catch (err) {
      if (err.status === 429 && attempt < MAX_RETRIES) {
        const waitSec = attempt * 15;
        console.log(`  Rate limited, retrying in ${waitSec}s (attempt ${attempt}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
}

// ── Layer 3: Sonnet deep analysis ────────────────────────────────────────────

function buildSonnetPrompt(pr, title, diff, haikuResult) {
  const maxLines = 500;
  const lines = diff.split('\n');
  const usable = lines.length > maxLines
    ? lines.slice(0, maxLines).join('\n') + `\n\n... (${lines.length - maxLines} more lines truncated)`
    : diff;

  return `You are a code risk assessor for SuperDoc — a document editing and rendering library.

## Project Context
Critical subsystems:
- **Layout Engine** (packages/layout-engine/): style resolution, pagination, DOM painting, PM adapter
- **Super Converter** (packages/super-editor/src/core/super-converter/): DOCX import/export
- **Presentation Editor** (packages/super-editor/src/core/presentation-editor/): bridges editor ↔ layout
- **Word Layout** (packages/word-layout/): Word document layout algorithms

Sensitive: editor extensions, editor core, superdoc package, shared utilities, esign.
Low: docs, config, CI, tooling, standalone tests.

## Prior Triage (Haiku)
Level: ${haikuResult.level}, Change type: ${haikuResult.change_type}
Summary: ${haikuResult.summary}

## PR #${pr}: "${title}"

\`\`\`diff
${usable}
\`\`\`

## Instructions

You have a STRICT budget of 8 tool calls. Use them wisely:
- 2-3 Reads on the most important changed files
- 2-3 Greps to check caller count / blast radius of changed functions
- Do NOT exhaustively trace every reference. Sample enough to assess risk.

Focus on:
1. How widely changed functions are used (grep for callers)
2. Whether changes are backward-compatible
3. Whether tests cover the changed behavior

## Output (MANDATORY)

End your response with this exact JSON structure. No markdown fences.

{"level":"critical|sensitive|low","confidence":"high|medium|low","summary":"One sentence of actual risk","key_changes":["Change 1","Change 2"],"blast_radius":"What could break and how widely","reasoning":"2-3 sentences explaining your assessment"}`;
}

async function sonnetDeepAnalysis(pr, title, diff, haikuResult, repoRoot) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const prompt = buildSonnetPrompt(pr, title, diff, haikuResult);

  let resultText = '';
  let cost = 0;
  let durationMs = 0;
  const toolCalls = [];

  for await (const msg of query({
    prompt,
    options: {
      allowedTools: ['Read', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions',
      maxTurns: 20,
      cwd: repoRoot,
    },
  })) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') resultText = block.text;
        if (block.type === 'tool_use') {
          const input = block.input || {};
          toolCalls.push(`${block.name}: ${input.pattern || input.file_path || ''}`);
        }
      }
    }
    if (msg.type === 'result') {
      cost = msg.total_cost_usd || 0;
      durationMs = msg.duration_api_ms || msg.duration_ms || 0;
    }
  }

  const parsed = extractJSON(resultText);
  if (parsed) {
    return { ...parsed, cost, durationMs, toolCalls };
  }
  throw new Error(`Sonnet failed to produce JSON: ${resultText.slice(0, 200)}`);
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

async function assess(prNumber, { forceDeep = false, repoRoot } = {}) {
  const title = run(`gh pr view ${prNumber} --repo ${REPO} --json title --jq .title`);
  const files = getPRFiles(prNumber).split('\n').filter(Boolean);
  const diff = getPRDiff(prNumber);

  console.log(`\nPR #${prNumber}: ${title}`);
  console.log(`Files changed: ${files.length}`);

  // Layer 1: File-path classification
  const filePath = await filePathClassify(files);
  console.log(`  L1 file-path: ${filePath.level}${filePath.downgraded ? ' (downgraded — test-only)' : ''}`);

  // Skip AI for low-risk PRs (unless forced)
  if (filePath.level === 'low' && !forceDeep) {
    console.log('  → Low risk, skipping AI assessment');
    return {
      prNumber, title,
      filePath,
      haiku: null,
      sonnet: null,
      finalLevel: 'low',
      totalCost: 0,
    };
  }

  // Layer 2: Haiku triage
  console.log('  L2 Haiku triage...');
  const haiku = await haikuTriage(prNumber, title, files.join('\n'), diff);
  console.log(`  L2 haiku: ${haiku.level} [${haiku.change_type}] (${haiku.confidence}) — $${haiku.cost.toFixed(4)}`);
  console.log(`     ${haiku.summary}`);

  // Decide if deep analysis is needed
  // Escalate to Sonnet when:
  // 1. Forced via --deep flag, OR
  // 2. Haiku says behavioral AND file-path or haiku level is critical, OR
  // 3. Haiku explicitly requests deep analysis AND change is not purely additive
  const needsDeep = forceDeep ||
    (haiku.change_type === 'behavioral' && (filePath.level === 'critical' || haiku.level === 'critical')) ||
    (haiku.needs_deep_analysis && haiku.change_type !== 'additive');

  if (!needsDeep) {
    console.log('  → Haiku triage sufficient, skipping deep analysis');
    return {
      prNumber, title,
      filePath,
      haiku,
      sonnet: null,
      finalLevel: haiku.level,
      totalCost: haiku.cost,
    };
  }

  // Layer 3: Sonnet deep analysis
  console.log('  L3 Sonnet deep analysis...');
  const sonnet = await sonnetDeepAnalysis(prNumber, title, diff, haiku, repoRoot);
  console.log(`  L3 sonnet: ${sonnet.level} (${sonnet.confidence}) — $${sonnet.cost.toFixed(4)}`);
  console.log(`     ${sonnet.summary}`);

  return {
    prNumber, title,
    filePath,
    haiku,
    sonnet,
    finalLevel: sonnet.level,
    totalCost: haiku.cost + sonnet.cost,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const prNumbers = args.filter(a => !a.startsWith('--')).map(Number).filter(Boolean);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY required');
    process.exit(1);
  }

  if (!prNumbers.length) {
    console.error('Usage: node risk-assess.mjs <pr-number...> [--deep] [--dry-run]');
    process.exit(1);
  }

  const forceDeep = flags.has('--deep');
  const repoRoot = process.env.REPO_ROOT || run('git rev-parse --show-toplevel');

  const results = [];
  let totalCost = 0;

  for (const pr of prNumbers) {
    try {
      const result = await assess(pr, { forceDeep, repoRoot });
      results.push(result);
      totalCost += result.totalCost;
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      results.push({ prNumber: pr, error: err.message });
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(95)}`);
  console.log('TIERED RISK ASSESSMENT');
  console.log(`${'═'.repeat(95)}`);
  console.log(
    'PR'.padEnd(8) + 'Title'.padEnd(35) +
    'L1 Path'.padEnd(10) + 'L2 Haiku'.padEnd(10) + 'L3 Sonnet'.padEnd(10) +
    'Final'.padEnd(10) + 'Cost'
  );
  console.log('─'.repeat(95));

  for (const r of results) {
    if (r.error) {
      console.log(`#${r.prNumber}`.padEnd(8) + `ERROR: ${r.error}`);
      continue;
    }
    console.log(
      `#${r.prNumber}`.padEnd(8) +
      (r.title || '').slice(0, 33).padEnd(35) +
      (r.filePath?.level || '-').padEnd(10) +
      (r.haiku?.level || 'skip').padEnd(10) +
      (r.sonnet?.level || 'skip').padEnd(10) +
      r.finalLevel.padEnd(10) +
      `$${r.totalCost.toFixed(4)}`
    );
  }

  console.log('─'.repeat(95));
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  // Write results
  const outPath = '/tmp/tiered-risk-assessment.json';
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Full results: ${outPath}`);

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const last = results[results.length - 1];
    if (last && !last.error) {
      const output = [
        `level=${last.finalLevel}`,
        `haiku_level=${last.haiku?.level || 'skipped'}`,
        `sonnet_level=${last.sonnet?.level || 'skipped'}`,
        `cost=${totalCost.toFixed(4)}`,
        `summary=${last.sonnet?.summary || last.haiku?.summary || 'File-path only'}`,
      ].join('\n');
      writeFileSync(process.env.GITHUB_OUTPUT, output, { flag: 'a' });
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
