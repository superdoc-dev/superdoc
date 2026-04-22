#!/usr/bin/env bun
// Ad-hoc batch runner — iterates every .docx under a directory, runs compare-rendering,
// and prints a summary. Not part of M1; this is scaffolding for M3's --input-dir mode.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { spawn } from 'node:child_process';

const INPUT_DIR = resolve(process.argv[2] ?? 'test-corpus/rendering');
const OUTPUT_DIR = resolve(process.argv[3] ?? 'test-corpus/.reports');
const CLI = resolve(new URL('../src/cli.ts', import.meta.url).pathname);

await mkdir(OUTPUT_DIR, { recursive: true });

const files = (await readdir(INPUT_DIR)).filter((f) => f.endsWith('.docx')).sort();

console.log(`[batch] ${files.length} docs under ${INPUT_DIR}\n`);

type Summary = {
  file: string;
  status: 'match' | 'diffs' | 'skipped' | 'error';
  supported: boolean;
  unsupportedReason?: string;
  findings: number;
  byCategory: Record<string, number>;
  durationMs: number;
  note?: string;
};

const summaries: Summary[] = [];
const start = Date.now();

for (let i = 0; i < files.length; i += 1) {
  const f = files[i]!;
  const input = join(INPUT_DIR, f);
  const output = join(OUTPUT_DIR, f.replace(/\.docx$/, '.json'));
  const t0 = Date.now();

  const status = await runOne(input, output);
  const ms = Date.now() - t0;

  try {
    const raw = JSON.parse(await readFile(output, 'utf8'));
    const byCategory: Record<string, number> = {};
    for (const finding of raw.findings ?? []) {
      byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    }
    const supported = raw.wordSupported === true;
    summaries.push({
      file: f,
      status: !supported ? 'skipped' : raw.findings.length === 0 ? 'match' : 'diffs',
      supported,
      unsupportedReason: raw.unsupportedReason,
      findings: (raw.findings ?? []).length,
      byCategory,
      durationMs: ms,
    });
  } catch {
    summaries.push({
      file: f,
      status: 'error',
      supported: false,
      findings: 0,
      byCategory: {},
      durationMs: ms,
      note: `CLI exit ${status}`,
    });
  }

  const last = summaries[summaries.length - 1]!;
  const marker = last.status === 'match' ? '✓' : last.status === 'diffs' ? '⚠' : last.status === 'skipped' ? '–' : '✗';
  const tail =
    last.status === 'skipped'
      ? `skipped: ${last.unsupportedReason}`
      : last.status === 'diffs'
        ? `${last.findings} finding(s) ${JSON.stringify(last.byCategory)}`
        : last.status === 'match'
          ? 'match'
          : (last.note ?? 'error');
  console.log(`[${i + 1}/${files.length}] ${marker} ${f} (${ms}ms) — ${tail}`);
}

const totalMs = Date.now() - start;

console.log(`\n[batch] done in ${(totalMs / 1000).toFixed(1)}s`);

const counts = { match: 0, diffs: 0, skipped: 0, error: 0 };
for (const s of summaries) counts[s.status] += 1;
console.log(`\nOverall:`);
console.log(`  match:   ${counts.match}`);
console.log(`  diffs:   ${counts.diffs}`);
console.log(`  skipped: ${counts.skipped}`);
console.log(`  error:   ${counts.error}`);

const reasons: Record<string, number> = {};
for (const s of summaries) {
  if (s.status === 'skipped' && s.unsupportedReason) {
    const key = s.unsupportedReason.replace(/\s*\(\d+\)$/, '');
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
}
if (Object.keys(reasons).length) {
  console.log(`\nSkip reasons:`);
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)} × ${k}`);
  }
}

const categories: Record<string, number> = {};
for (const s of summaries) {
  for (const [cat, count] of Object.entries(s.byCategory)) {
    categories[cat] = (categories[cat] ?? 0) + count;
  }
}
if (Object.keys(categories).length) {
  console.log(`\nFindings by category (across docs with diffs):`);
  for (const [k, v] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)} × ${k}`);
  }
}

const summaryPath = join(OUTPUT_DIR, '_summary.json');
await writeFile(summaryPath, JSON.stringify({ totalMs, counts, reasons, categories, summaries }, null, 2));
console.log(`\n[batch] summary written to ${summaryPath}`);

function runOne(input: string, output: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('bun', [CLI, '--input', input, '--output', output, '--format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    // Drain stdio to avoid backpressure; we don't print the CLI's own logs.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.on('close', (code) => resolve(code ?? 0));
  });
}
