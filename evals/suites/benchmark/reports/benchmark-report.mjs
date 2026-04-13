#!/usr/bin/env node
/**
 * Level 3 Benchmark Report Generator
 *
 * Reads artifacts/benchmark-runs/latest.json (Promptfoo output) and produces:
 * 1. Summary table: pass rate, latency (median + p95), tokens in/out, steps, cost, collateral
 * 2. Per-task detail: every metric per condition, side by side
 * 3. Path usage table (agent-choice conditions)
 * 4. Written recommendation
 *
 * Output: artifacts/benchmark-runs/summary.md + artifacts/benchmark-runs/raw.csv
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '../../../..');
const RESULTS_DIR = resolve(EVALS_ROOT, 'artifacts/benchmark-runs');
const INPUT_FILE = resolve(RESULTS_DIR, 'latest.json');

// --- Cost estimation (per 1M tokens, approximate) ---
const COST_PER_1M = {
  'codex': { input: 2.50, output: 10.00 },   // o3 via Codex
  'claude': { input: 3.00, output: 15.00 },   // sonnet via Claude
};

function estimateCost(provider, inputTokens, outputTokens) {
  const key = provider.toLowerCase().startsWith('cc') ? 'claude' : 'codex';
  const rates = COST_PER_1M[key];
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

// --- Stats ---

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p95(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

// --- Parse ---

function parseResults(raw) {
  const rows = [];
  for (const result of raw.results?.results || []) {
    const provider = result.provider?.label || result.provider?.id || 'unknown';
    const description = result.test?.description || result.vars?.task || '';
    const passed = result.success;

    let parsed = {};
    try { parsed = JSON.parse(result.response?.output || '{}'); } catch {}

    const inputTokens = parsed.usage?.input_tokens || 0;
    const outputTokens = parsed.usage?.output_tokens || 0;
    const cost = parsed.cost || estimateCost(provider, inputTokens, outputTokens);

    rows.push({
      provider,
      description,
      passed,
      stepCount: parsed.stepCount || 0,
      cost,
      duration: parsed.duration || 0,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      pathUsed: parsed.pathUsed || 'unknown',
      condition: parsed.condition || provider,
      collateral: (result.assertionResults || [])
        .filter(a => a.metric === 'collateral')
        .every(a => a.pass),
      fidelity: (result.assertionResults || [])
        .filter(a => a.metric === 'fidelity')
        .map(a => a.score ?? (a.pass ? 1 : 0))[0] ?? null,
    });
  }
  return rows;
}

// --- Summary table ---

function generateSummaryTable(rows) {
  const conditions = [...new Set(rows.map(r => r.provider))];
  const lines = [
    '## Summary by Condition\n',
    '| Condition | Pass Rate | Collateral | Fidelity | Med. Latency | p95 Latency | Med. Steps | Input Tok | Output Tok | Total Tok | Est. Cost |',
    '|-----------|-----------|-----------|---------|-------------|------------|-----------|----------|-----------|----------|----------|',
  ];

  for (const cond of conditions) {
    const cr = rows.filter(r => r.provider === cond);
    const passRate = (cr.filter(r => r.passed).length / cr.length * 100).toFixed(0);
    const collRate = (cr.filter(r => r.collateral).length / cr.length * 100).toFixed(0);
    const fidelityRows = cr.filter(r => r.fidelity !== null);
    const fidRate = fidelityRows.length > 0
      ? (fidelityRows.filter(r => r.fidelity >= 1).length / fidelityRows.length * 100).toFixed(0) + '%'
      : '-';
    const medLat = Math.round(median(cr.map(r => r.duration)) / 1000);
    const p95Lat = Math.round(p95(cr.map(r => r.duration)) / 1000);
    const medSteps = Math.round(median(cr.map(r => r.stepCount)));
    const medIn = fmt(median(cr.map(r => r.inputTokens)));
    const medOut = fmt(median(cr.map(r => r.outputTokens)));
    const medTot = fmt(median(cr.map(r => r.totalTokens)));
    const totalCost = cr.reduce((sum, r) => sum + r.cost, 0);

    lines.push(
      `| ${cond} | ${passRate}% | ${collRate}% | ${fidRate} | ${medLat}s | ${p95Lat}s | ${medSteps} | ${medIn} | ${medOut} | ${medTot} | $${totalCost.toFixed(4)} |`
    );
  }

  return lines.join('\n');
}

// --- Per-task detail ---

function generatePerTaskDetail(rows) {
  const tasks = [...new Set(rows.map(r => r.description))];
  const conditions = [...new Set(rows.map(r => r.provider))];

  const lines = [
    '\n## Per-Task Detail\n',
    `| Task | Condition | Pass | Path | Steps | Latency | In Tok | Out Tok | Est. Cost |`,
    `|------|-----------|------|------|-------|---------|--------|---------|----------|`,
  ];

  for (const task of tasks) {
    const shortTask = task.length > 40 ? task.substring(0, 37) + '...' : task;
    let first = true;
    for (const cond of conditions) {
      const row = rows.find(r => r.description === task && r.provider === cond);
      if (!row) continue;
      const label = first ? shortTask : '';
      first = false;
      lines.push(
        `| ${label} | ${cond} | ${row.passed ? 'PASS' : 'FAIL'} | ${row.pathUsed} | ${row.stepCount} | ${Math.round(row.duration / 1000)}s | ${fmt(row.inputTokens)} | ${fmt(row.outputTokens)} | $${row.cost.toFixed(4)} |`
      );
    }
  }

  return lines.join('\n');
}

// --- Path usage (choice conditions) ---

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
    const shortTask = task.length > 50 ? task.substring(0, 47) + '...' : task;
    const cc = ccChoice.find(r => r.description === task);
    const codex = codexChoice.find(r => r.description === task);
    lines.push(`| ${shortTask} | ${cc?.pathUsed || '-'} | ${codex?.pathUsed || '-'} |`);
  }

  return lines.join('\n');
}

// --- Recommendation ---

function generateRecommendation(rows) {
  const lines = ['\n## Recommendation\n'];

  for (const agent of ['CC', 'Codex']) {
    const baseline = rows.filter(r => r.provider === `${agent}-baseline`);
    const sdSkill = rows.filter(r => r.provider === `${agent}-superdoc-mcp`);
    if (baseline.length === 0 || sdSkill.length === 0) continue;

    const bPass = baseline.filter(r => r.passed).length / baseline.length;
    const sPass = sdSkill.filter(r => r.passed).length / sdSkill.length;
    const delta = sPass - bPass;

    const label = agent === 'CC' ? 'Claude Code' : 'Codex';
    if (delta > 0.2) lines.push(`- **${label} + SuperDoc wins big**: +${(delta * 100).toFixed(0)}% pass rate over baseline`);
    else if (delta > 0.05) lines.push(`- **${label} + SuperDoc helps**: +${(delta * 100).toFixed(0)}% pass rate over baseline`);
    else if (delta > -0.05) lines.push(`- **${label} + SuperDoc is neutral on pass rate**: ${(delta * 100).toFixed(0)}% delta`);
    else lines.push(`- **${label} + SuperDoc hurts pass rate**: ${(delta * 100).toFixed(0)}% delta`);

    // Latency comparison
    const bLat = median(baseline.map(r => r.duration));
    const sLat = median(sdSkill.map(r => r.duration));
    const latDelta = ((sLat - bLat) / bLat * 100).toFixed(0);
    lines.push(`  - Latency: SuperDoc ${parseInt(latDelta) > 0 ? '+' : ''}${latDelta}% vs baseline (${Math.round(sLat/1000)}s vs ${Math.round(bLat/1000)}s median)`);

    // Token comparison
    const bTok = median(baseline.map(r => r.totalTokens));
    const sTok = median(sdSkill.map(r => r.totalTokens));
    const tokDelta = ((sTok - bTok) / bTok * 100).toFixed(0);
    lines.push(`  - Tokens: SuperDoc ${parseInt(tokDelta) > 0 ? '+' : ''}${tokDelta}% vs baseline (${fmt(sTok)} vs ${fmt(bTok)} median)`);

    // Cost comparison
    const bCost = baseline.reduce((s, r) => s + r.cost, 0);
    const sCost = sdSkill.reduce((s, r) => s + r.cost, 0);
    lines.push(`  - Cost: SuperDoc $${sCost.toFixed(4)} vs baseline $${bCost.toFixed(4)} (${sdSkill.length} tasks)`);

    // Steps comparison
    const bSteps = median(baseline.map(r => r.stepCount));
    const sSteps = median(sdSkill.map(r => r.stepCount));
    lines.push(`  - Steps: SuperDoc ${sSteps} vs baseline ${bSteps} median`);

    // Collateral
    const bColl = (baseline.filter(r => r.collateral).length / baseline.length * 100).toFixed(0);
    const sColl = (sdSkill.filter(r => r.collateral).length / sdSkill.length * 100).toFixed(0);
    lines.push(`  - Collateral safety: SuperDoc ${sColl}% vs baseline ${bColl}%`);
  }

  if (lines.length === 1) {
    lines.push('Insufficient data. Run the full benchmark with baseline + superdoc-mcp conditions.');
  }

  return lines.join('\n');
}

// --- CSV ---

function generateCsv(rows) {
  const headers = [
    'provider', 'description', 'passed', 'stepCount', 'cost',
    'duration_ms', 'inputTokens', 'outputTokens', 'totalTokens',
    'pathUsed', 'condition', 'collateral',
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
  generatePerTaskDetail(rows),
  generatePathTable(rows),
  generateRecommendation(rows),
].join('\n');

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(resolve(RESULTS_DIR, 'summary.md'), report);
writeFileSync(resolve(RESULTS_DIR, 'raw.csv'), generateCsv(rows));

console.log(`Report written to: artifacts/benchmark-runs/summary.md`);
console.log(`CSV written to: artifacts/benchmark-runs/raw.csv`);
