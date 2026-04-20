#!/usr/bin/env bun
import { parseArgs as nodeParseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { extractWord } from './word.ts';
import { extractSuperDoc } from './superdoc.ts';
import { normalizeSuperDoc, normalizeWord } from './normalize.ts';
import { diffParagraphs } from './differ.ts';
import { formatJson, formatMarkdown } from './format.ts';
import type { CompareReport, Finding } from './types.ts';

type Args = {
  input: string;
  output?: string;
  format: 'json' | 'md';
  pipeline: 'presentation' | 'headless';
  cache: boolean;
};

const USAGE = `compare-rendering — diff Word vs SuperDoc rendering (paragraph-only scope)

Usage:
  pnpm compare-rendering -- --input <docx> [options]

Options:
  --input <path>             Required. Path to a .docx file.
  --output <path>            Write the report to a file (default: stdout).
  --format json|md           Output format (default: json).
  --pipeline presentation|headless   SuperDoc layout pipeline (default: presentation).
  --no-cache                 Bypass the Word extraction cache.
  -h, --help                 Show this help.

Env:
  WORD_MCP_URL               HTTP endpoint of the word-mcp worker.
  WORD_MCP_TOKEN             Bearer token for the worker.

Exit codes:
  0  — ran; findings are at most visible/cosmetic.
  1  — tool error (network, missing file, bad args).
  2  — ran; emitted at least one blocking finding.`;

function parseArgs(argv: string[]): Args {
  const { values } = nodeParseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      format: { type: 'string', default: 'json' },
      pipeline: { type: 'string', default: 'presentation' },
      'no-cache': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!values.input) throw new Error('--input <docx> is required');
  if (values.format !== 'json' && values.format !== 'md') {
    throw new Error(`--format must be json or md, got "${values.format}"`);
  }
  if (values.pipeline !== 'presentation' && values.pipeline !== 'headless') {
    throw new Error(`--pipeline must be presentation or headless, got "${values.pipeline}"`);
  }

  return {
    input: values.input,
    output: values.output,
    format: values.format,
    pipeline: values.pipeline,
    cache: !values['no-cache'],
  };
}

function hasBlocking(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'blocking');
}

const log = (msg: string) => console.error(`[compare-rendering] ${msg}`);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const docxPath = resolve(args.input);

  log(`word: extracting ${docxPath}`);
  const wordStart = Date.now();
  const { extraction: wordExtraction, sha, cached } = await extractWord(docxPath, { cache: args.cache });
  log(`word: ${cached ? 'cached' : 'fresh'} extraction in ${Date.now() - wordStart}ms (sha=${sha.slice(0, 12)})`);

  if (!wordExtraction.supported) {
    const report: CompareReport = {
      docxPath,
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
          category: 'unsupported',
          severity: 'cosmetic',
          paragraphOrdinal: 0,
          word: wordExtraction.unsupportedReason,
          superdoc: null,
          message: `Document skipped: ${wordExtraction.unsupportedReason ?? 'unsupported'}`,
        },
      ],
    };
    await emit(report, args);
    return;
  }

  log('superdoc: running layout:export-one');
  const sdStart = Date.now();
  const sdExtraction = await extractSuperDoc(docxPath, { pipeline: args.pipeline });
  log(`superdoc: extracted in ${Date.now() - sdStart}ms`);

  const wordParas = normalizeWord(wordExtraction);
  const sdParas = normalizeSuperDoc(sdExtraction);

  const findings = diffParagraphs(wordParas, sdParas);

  const report: CompareReport = {
    docxPath,
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

  await emit(report, args);
  if (hasBlocking(findings)) process.exitCode = 2;
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

main().catch((e) => {
  console.error(`[compare-rendering] error: ${(e as Error).message}`);
  process.exit(1);
});
