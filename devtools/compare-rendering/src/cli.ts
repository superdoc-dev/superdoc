#!/usr/bin/env bun
import { parseArgs as nodeParseArgs } from 'node:util';
import { readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { extractWord } from './word.ts';
import { extractSuperDoc } from './superdoc.ts';
import { normalizeSuperDoc, normalizeWord } from './normalize.ts';
import { diffParagraphs } from './differ.ts';
import { formatDeltaJson, formatDeltaMarkdown, formatJson, formatMarkdown } from './format.ts';
import { diffAgainstBaseline, readBaseline, writeBaseline } from './baseline.ts';
import type { CompareReport, DeltaReport, Finding } from './types.ts';

type Args = {
  input?: string;
  inputDir?: string;
  output?: string;
  format: 'json' | 'md';
  pipeline: 'presentation' | 'headless';
  cache: boolean;
  baseline?: string;
  saveBaseline?: string;
};

const USAGE = `compare-rendering — diff Word vs SuperDoc rendering (paragraph-only scope)

Usage:
  pnpm compare-rendering -- --input <docx> [options]
  pnpm compare-rendering -- --input-dir <dir> [options]

Options:
  --input <path>             Path to a .docx file (single-doc mode).
  --input-dir <path>         Directory of .docx files (corpus mode).
  --output <path>            Write report to file (default: stdout).
  --format json|md           Output format (default: json).
  --pipeline presentation|headless   SuperDoc layout pipeline (default: presentation).
  --no-cache                 Bypass the Word extraction cache.
  --baseline <path>          Compare current run against a baseline; emit delta.
  --save-baseline <path>     Run and write findings as a baseline snapshot.
  -h, --help                 Show this help.

Env:
  WORD_API_URL               Base URL of the word-api worker.
  WORD_API_TOKEN             Bearer token for the worker.

Exit codes:
  0  — ran; no blocking findings, no regressions vs baseline.
  1  — tool error (network, missing file, bad args).
  2  — ran; emitted blocking finding, or new findings vs baseline.`;

function parseArgs(argv: string[]): Args {
  const { values } = nodeParseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      'input-dir': { type: 'string' },
      output: { type: 'string' },
      format: { type: 'string', default: 'json' },
      pipeline: { type: 'string', default: 'presentation' },
      'no-cache': { type: 'boolean', default: false },
      baseline: { type: 'string' },
      'save-baseline': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!values.input && !values['input-dir']) {
    throw new Error('one of --input or --input-dir is required');
  }
  if (values.input && values['input-dir']) {
    throw new Error('--input and --input-dir are mutually exclusive');
  }
  if (values.format !== 'json' && values.format !== 'md') {
    throw new Error(`--format must be json or md, got "${values.format}"`);
  }
  if (values.pipeline !== 'presentation' && values.pipeline !== 'headless') {
    throw new Error(`--pipeline must be presentation or headless, got "${values.pipeline}"`);
  }
  if (values.baseline && values['save-baseline']) {
    throw new Error('--baseline and --save-baseline are mutually exclusive');
  }

  return {
    input: values.input,
    inputDir: values['input-dir'],
    output: values.output,
    format: values.format,
    pipeline: values.pipeline,
    cache: !values['no-cache'],
    baseline: values.baseline,
    saveBaseline: values['save-baseline'],
  };
}

function hasBlocking(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'blocking');
}

const log = (msg: string) => console.error(`[compare-rendering] ${msg}`);

async function compareOne(docxPath: string, args: Args): Promise<CompareReport> {
  const absPath = resolve(docxPath);
  const wordStart = Date.now();
  const { extraction: wordExtraction, sha, cached } = await extractWord(absPath, { cache: args.cache });
  log(`word: ${cached ? 'cached' : 'fresh'} extraction in ${Date.now() - wordStart}ms (sha=${sha.slice(0, 12)})`);

  if (!wordExtraction.supported) {
    return {
      docxPath: absPath,
      docxSha: sha,
      wordSupported: false,
      unsupportedReason: wordExtraction.unsupportedReason,
      counts: {
        wordParagraphs: 0,
        superdocParagraphs: 0,
        wordPages: wordExtraction.pageCount,
        superdocPages: 0,
      },
      findings: [
        {
          fingerprint: 'unsupported:0',
          category: 'unsupported',
          severity: 'cosmetic',
          paragraphOrdinal: 0,
          word: wordExtraction.unsupportedReason,
          superdoc: null,
          message: `Document skipped: ${wordExtraction.unsupportedReason ?? 'unsupported'}`,
        },
      ],
    };
  }

  const sdStart = Date.now();
  const sdExtraction = await extractSuperDoc(absPath, { pipeline: args.pipeline });
  log(`superdoc: extracted in ${Date.now() - sdStart}ms`);

  const wordParas = normalizeWord(wordExtraction);
  const sdParas = normalizeSuperDoc(sdExtraction);
  const findings = diffParagraphs(wordParas, sdParas);

  return {
    docxPath: absPath,
    docxSha: sha,
    wordSupported: true,
    counts: {
      wordParagraphs: wordParas.length,
      superdocParagraphs: sdParas.length,
      wordPages: wordExtraction.pageCount,
      superdocPages: sdExtraction.pageCount,
    },
    findings,
  };
}

async function listDocxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.toLowerCase().endsWith('.docx'))
    .sort()
    .map((f) => join(dir, f));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const files = args.input ? [resolve(args.input)] : await listDocxFiles(resolve(args.inputDir!));
  if (files.length === 0) {
    throw new Error(`no .docx files found in ${args.inputDir}`);
  }

  log(`running ${files.length} doc(s)`);
  const reports: CompareReport[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i]!;
    log(`[${i + 1}/${files.length}] ${f.split('/').pop()}`);
    reports.push(await compareOne(f, args));
  }

  if (args.saveBaseline) {
    await writeBaseline(resolve(args.saveBaseline), reports);
    log(`wrote baseline to ${resolve(args.saveBaseline)}`);
    return;
  }

  if (args.baseline) {
    const baseline = await readBaseline(resolve(args.baseline));
    const delta = diffAgainstBaseline(reports, baseline);
    await emitDelta(delta, args);
    log(`resolved=${delta.totals.resolved} new=${delta.totals.new} unchanged=${delta.totals.unchanged}`);
    if (delta.totals.new > 0) process.exitCode = 2;
    return;
  }

  // Default: emit one report (single-doc) or a JSON array (corpus).
  if (reports.length === 1) {
    await emit(reports[0]!, args);
    if (hasBlocking(reports[0]!.findings)) process.exitCode = 2;
  } else {
    const out = `${JSON.stringify(reports, null, 2)}\n`;
    if (args.output) {
      await writeFile(resolve(args.output), out, 'utf8');
      log(`wrote ${resolve(args.output)}`);
    } else {
      process.stdout.write(out);
    }
    if (reports.some((r) => hasBlocking(r.findings))) process.exitCode = 2;
  }
}

async function emit(report: CompareReport, args: Args): Promise<void> {
  const out = args.format === 'md' ? formatMarkdown(report) : formatJson(report);
  if (args.output) {
    await writeFile(resolve(args.output), out, 'utf8');
    log(`wrote ${resolve(args.output)}`);
  } else {
    process.stdout.write(out);
  }
}

async function emitDelta(delta: DeltaReport, args: Args): Promise<void> {
  const out = args.format === 'md' ? formatDeltaMarkdown(delta) : formatDeltaJson(delta);
  if (args.output) {
    await writeFile(resolve(args.output), out, 'utf8');
    log(`wrote ${resolve(args.output)}`);
  } else {
    process.stdout.write(out);
  }
}

main().catch((e) => {
  console.error(`[compare-rendering] error: ${(e as Error).message}`);
  process.exit(1);
});
