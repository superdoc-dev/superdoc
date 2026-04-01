#!/usr/bin/env node
/**
 * Level 3 Benchmark Report Generator
 *
 * Reads results/benchmark/latest.json (Promptfoo output) and produces:
 * 1. Summary table (per condition): pass rate, median latency, tokens, steps, cost
 * 2. Path usage table (agent-choice conditions only)
 * 3. Per-task breakdown with pass/fail per condition
 * 4. Written recommendation
 *
 * Output: results/benchmark/summary.md + results/benchmark/raw.csv
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(EVALS_ROOT, 'results/benchmark');
const INPUT_FILE = resolve(RESULTS_DIR, 'latest.json');

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseResults(raw) {
  const rows = [];
  for (const result of raw.results?.results || []) {
    const provider = result.provider?.label || result.provider?.id || 'unknown';
    const description = result.test?.description || '';
    const passed = result.success;

    // Extract metrics from componentResults
    const metrics = {};
    for (const assertion of result.assertionResults || []) {
      if (assertion.componentResults) {
        for (const cr of assertion.componentResults) {
          for (const [k, v] of Object.entries(cr.namedScores || {})) {
            metrics[k] = v;
          }
        }
      }
    }

    // Also try to parse from the raw output
    let parsed = {};
    try {
      parsed = JSON.parse(result.response?.output || '{}');
    } catch {}

    // Prefer parsed output (always present) over componentResults (may be empty)
    const inputTokens = parsed.usage?.input_tokens || 0;
    const outputTokens = parsed.usage?.output_tokens || 0;

    rows.push({
      provider,
      description: description || result.vars?.task || '',
      passed,
      stepCount: parsed.stepCount || metrics.step_count || 0,
      cost: parsed.cost || metrics.cost_usd || 0,
      duration: parsed.duration || metrics.duration_ms || 0,
      tokens: inputTokens + outputTokens,
      pathUsed: parsed.pathUsed || metrics.path_used || 'unknown',
      condition: parsed.condition || provider,
      collateral: (result.assertionResults || [])
        .filter(a => a.metric === 'collateral')
        .every(a => a.pass),
    });
  }
  return rows;
}

function generateSummaryTable(rows) {
  const conditions = [...new Set(rows.map(r => r.provider))];
  const lines = [
    '## Summary by Condition\n',
    '| Condition | Pass Rate | Median Latency | Median Tokens | Median Steps | Collateral Rate | Median Cost |',
    '|-----------|-----------|---------------|---------------|-------------|-----------------|-------------|',
  ];

  for (const cond of conditions) {
    const condRows = rows.filter(r => r.provider === cond);
    const passRate = (condRows.filter(r => r.passed).length / condRows.length * 100).toFixed(0);
    const medLatency = Math.round(median(condRows.map(r => r.duration)) / 1000);
    const medTokens = Math.round(median(condRows.map(r => r.tokens)));
    const medSteps = Math.round(median(condRows.map(r => r.stepCount)));
    const collateralRate = (condRows.filter(r => r.collateral).length / condRows.length * 100).toFixed(0);
    const medCost = median(condRows.map(r => r.cost)).toFixed(4);

    lines.push(
      `| ${cond} | ${passRate}% | ${medLatency}s | ${medTokens} | ${medSteps} | ${collateralRate}% | $${medCost} |`
    );
  }

  return lines.join('\n');
}

function generatePathTable(rows) {
  const choiceRows = rows.filter(r =>
    r.provider.endsWith('-choice') || r.condition === 'choice'
  );
  if (choiceRows.length === 0) return '';

  const tasks = [...new Set(choiceRows.map(r => r.description))];
  const ccChoice = choiceRows.filter(r => r.provider.startsWith('CC'));
  const codexChoice = choiceRows.filter(r => r.provider.startsWith('Codex'));

  const lines = [
    '\n## Path Usage (Agent-Choice Conditions)\n',
    '| Task | CC-choice Path | Codex-choice Path |',
    '|------|---------------|-------------------|',
  ];

  for (const task of tasks) {
    const cc = ccChoice.find(r => r.description === task);
    const codex = codexChoice.find(r => r.description === task);
    lines.push(
      `| ${task} | ${cc?.pathUsed || '-'} | ${codex?.pathUsed || '-'} |`
    );
  }

  return lines.join('\n');
}

function generatePerTaskBreakdown(rows) {
  const tasks = [...new Set(rows.map(r => r.description))];
  const conditions = [...new Set(rows.map(r => r.provider))];

  const lines = [
    '\n## Per-Task Breakdown\n',
    `| Task | ${conditions.join(' | ')} |`,
    `|------|${conditions.map(() => '---').join('|')}|`,
  ];

  for (const task of tasks) {
    const cells = conditions.map(cond => {
      const row = rows.find(r => r.description === task && r.provider === cond);
      return row ? (row.passed ? 'PASS' : 'FAIL') : '-';
    });
    lines.push(`| ${task} | ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}

function generateRecommendation(rows) {
  const lines = ['\n## Recommendation\n'];

  for (const agent of ['CC', 'Codex']) {
    const baseline = rows.filter(r => r.provider === `${agent}-baseline`);
    const sdSkill = rows.filter(r => r.provider === `${agent}-superdoc-skill`);

    if (baseline.length === 0 || sdSkill.length === 0) continue;

    const baselinePassRate = baseline.filter(r => r.passed).length / baseline.length;
    const sdPassRate = sdSkill.filter(r => r.passed).length / sdSkill.length;
    const delta = sdPassRate - baselinePassRate;

    if (delta > 0.2) {
      lines.push(`- **${agent} + SuperDoc skill wins big**: +${(delta * 100).toFixed(0)}% pass rate over baseline`);
    } else if (delta > 0.05) {
      lines.push(`- **${agent} + SuperDoc skill helps**: +${(delta * 100).toFixed(0)}% pass rate over baseline`);
    } else if (delta > -0.05) {
      lines.push(`- **${agent} + SuperDoc skill is neutral**: ${(delta * 100).toFixed(0)}% delta vs baseline`);
    } else {
      lines.push(`- **${agent} + SuperDoc skill hurts**: ${(delta * 100).toFixed(0)}% delta vs baseline`);
    }

    const baselineTokens = median(baseline.map(r => r.tokens));
    const sdTokens = median(sdSkill.map(r => r.tokens));
    if (baselineTokens > 0) {
      const savings = ((baselineTokens - sdTokens) / baselineTokens * 100).toFixed(0);
      if (parseInt(savings) > 30) {
        lines.push(`  - Token savings: ${savings}% fewer tokens with SuperDoc`);
      }
    }

    const baselineCollateral = baseline.filter(r => r.collateral).length / baseline.length;
    const sdCollateral = sdSkill.filter(r => r.collateral).length / sdSkill.length;
    if (sdCollateral > baselineCollateral + 0.1) {
      lines.push(`  - Collateral damage reduced: ${(sdCollateral * 100).toFixed(0)}% safe vs ${(baselineCollateral * 100).toFixed(0)}% baseline`);
    }
  }

  if (lines.length === 1) {
    lines.push('Insufficient data to generate recommendations. Run the full benchmark first.');
  }

  return lines.join('\n');
}

function generateCsv(rows) {
  const headers = [
    'provider', 'description', 'passed', 'stepCount', 'cost',
    'duration', 'tokens', 'pathUsed', 'condition', 'collateral',
  ];
  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(headers.map(h => {
      const val = row[h];
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','));
  }
  return csvLines.join('\n');
}

// --- Main ---

if (!existsSync(INPUT_FILE)) {
  console.error(`No results file found at ${INPUT_FILE}`);
  console.error('Run: pnpm run eval:benchmark first');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(INPUT_FILE, 'utf8'));
const rows = parseResults(raw);

console.log(`Parsed ${rows.length} results from ${new Set(rows.map(r => r.provider)).size} conditions`);

const report = [
  '# Level 3: DOCX Agent Benchmark Results\n',
  `Generated: ${new Date().toISOString().slice(0, 10)}\n`,
  generateSummaryTable(rows),
  generatePathTable(rows),
  generatePerTaskBreakdown(rows),
  generateRecommendation(rows),
].join('\n');

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(resolve(RESULTS_DIR, 'summary.md'), report);
writeFileSync(resolve(RESULTS_DIR, 'raw.csv'), generateCsv(rows));

console.log(`Report written to: results/benchmark/summary.md`);
console.log(`CSV written to: results/benchmark/raw.csv`);
