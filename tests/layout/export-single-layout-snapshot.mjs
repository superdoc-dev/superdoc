#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const EXPORT_SCRIPT_PATH = path.join(SCRIPT_DIR, 'export-layout-snapshots.mjs');
const DEFAULT_PIPELINE = 'presentation';
const DEFAULT_TIMEOUT_MS = 30_000;

function printHelp() {
  console.log(`
Usage:
  pnpm layout:export-one -- --input <path> --output <path> [options]
  pnpm layout:export-one -- <path> --output <path> [options]

Options:
  --input <path>         Absolute or relative path to a single .docx file
  --output <path>        Exact output path for the generated layout snapshot JSON
  --pipeline <mode>      Layout pipeline: headless | presentation (default: ${DEFAULT_PIPELINE})
  --timeout-ms <ms>      Per-document layout timeout for presentation mode (default: ${DEFAULT_TIMEOUT_MS})
  --module <specifier>   Optional SuperEditor module override
  -h, --help             Show this help

Examples:
  pnpm layout:export-one -- --input ./test-corpus/tables/sample.docx --output /tmp/sample.layout.json
  pnpm layout:export-one -- ./test-corpus/tables/sample.docx --output /tmp/sample.layout.json
  pnpm layout:export-one -- --input ./test-corpus/tables/sample.docx --output /tmp/sample.layout.json --pipeline headless
`.trim());
}

function parseArgs(argv) {
  const args = {
    inputPath: '',
    outputPath: '',
    pipeline: DEFAULT_PIPELINE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    moduleSpecifier: '',
  };

  const requireValue = (optionName, optionValue) => {
    if (typeof optionValue !== 'string' || optionValue.length === 0 || optionValue.startsWith('-')) {
      throw new Error(`Missing value for ${optionName}.`);
    }
    return optionValue;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextArgument = argv[index + 1];

    if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    }

    if (argument === '--input') {
      args.inputPath = requireValue(argument, nextArgument);
      index += 1;
      continue;
    }

    if (argument === '--output') {
      args.outputPath = requireValue(argument, nextArgument);
      index += 1;
      continue;
    }

    if (argument === '--pipeline') {
      const pipeline = requireValue(argument, nextArgument).toLowerCase();
      if (pipeline !== 'headless' && pipeline !== 'presentation') {
        throw new Error(`Invalid value for --pipeline: "${nextArgument}".`);
      }
      args.pipeline = pipeline;
      index += 1;
      continue;
    }

    if (argument === '--timeout-ms') {
      const timeoutMs = Number(requireValue(argument, nextArgument));
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Invalid value for --timeout-ms: "${nextArgument}".`);
      }
      args.timeoutMs = timeoutMs;
      index += 1;
      continue;
    }

    if (argument === '--module') {
      args.moduleSpecifier = requireValue(argument, nextArgument);
      index += 1;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option "${argument}". Run with --help for usage.`);
    }

    if (!args.inputPath) {
      args.inputPath = argument;
      continue;
    }

    throw new Error(`Unexpected positional argument "${argument}". Run with --help for usage.`);
  }

  if (!args.inputPath) {
    throw new Error('Missing required option --input.');
  }

  if (!args.outputPath) {
    throw new Error('Missing required option --output.');
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.inputPath);
  const outputPath = path.resolve(args.outputPath);

  await assertDocxInput(inputPath);

  const tempRoot = await fs.mkdtemp(path.join(SCRIPT_DIR, 'tmp-export-one-'));
  const tempInputRoot = path.join(tempRoot, 'input');
  const tempOutputRoot = path.join(tempRoot, 'output');
  const tempInputPath = path.join(tempInputRoot, path.basename(inputPath));

  try {
    await fs.mkdir(tempInputRoot, { recursive: true });
    await fs.copyFile(inputPath, tempInputPath);

    await runExporter({
      inputRoot: tempInputRoot,
      outputRoot: tempOutputRoot,
      pipeline: args.pipeline,
      timeoutMs: args.timeoutMs,
      moduleSpecifier: args.moduleSpecifier,
    });

    const snapshotPaths = await findLayoutSnapshots(tempOutputRoot);
    if (snapshotPaths.length !== 1) {
      throw new Error(
        `Expected exactly one layout snapshot, found ${snapshotPaths.length} in ${tempOutputRoot}.`,
      );
    }

    const snapshotJson = await readJsonFile(snapshotPaths[0]);
    const normalizedSnapshotJson = normalizeSnapshotSourceMetadata(snapshotJson, inputPath);
    await writeJsonFileAtomically(outputPath, normalizedSnapshotJson);
    console.log(`[layout:export-one] ${inputPath} -> ${outputPath}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function assertDocxInput(inputPath) {
  const inputStat = await fs.stat(inputPath).catch(() => null);
  if (!inputStat || !inputStat.isFile()) {
    throw new Error(`Input DOCX file does not exist: ${inputPath}`);
  }

  if (!inputPath.toLowerCase().endsWith('.docx')) {
    throw new Error(`Input file must end with .docx: ${inputPath}`);
  }
}

async function runExporter({ inputRoot, outputRoot, pipeline, timeoutMs, moduleSpecifier }) {
  const commandArgs = [
    EXPORT_SCRIPT_PATH,
    '--input-root',
    inputRoot,
    '--output-root',
    outputRoot,
    '--limit',
    '1',
    '--pipeline',
    pipeline,
    '--timeout-ms',
    String(timeoutMs),
  ];

  if (moduleSpecifier) {
    commandArgs.push('--module', moduleSpecifier);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          signal
            ? `Layout snapshot exporter terminated with signal ${signal}.`
            : `Layout snapshot exporter failed with exit code ${code}.`,
        ),
      );
    });
  });
}

async function findLayoutSnapshots(rootPath) {
  const snapshotPaths = [];
  await walkDirectory(rootPath, snapshotPaths);
  snapshotPaths.sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
  return snapshotPaths;
}

async function walkDirectory(directoryPath, snapshotPaths) {
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true }).catch(() => []);

  for (const entry of directoryEntries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(entryPath, snapshotPaths);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.layout.json')) {
      snapshotPaths.push(entryPath);
    }
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function normalizeSnapshotSourceMetadata(snapshotJson, originalInputPath) {
  if (!snapshotJson || typeof snapshotJson !== 'object') {
    return snapshotJson;
  }

  const originalSource = snapshotJson.source && typeof snapshotJson.source === 'object'
    ? snapshotJson.source
    : {};
  const absoluteInputPath = path.resolve(originalInputPath);
  const relativeToRepoRoot = path.relative(REPO_ROOT, absoluteInputPath);
  const isWithinRepoRoot =
    Boolean(relativeToRepoRoot) &&
    relativeToRepoRoot !== '.' &&
    !relativeToRepoRoot.startsWith('..') &&
    !path.isAbsolute(relativeToRepoRoot);

  return {
    ...snapshotJson,
    source: {
      ...originalSource,
      docxAbsolutePath: absoluteInputPath,
      docxRelativePath: isWithinRepoRoot ? toPosixPath(relativeToRepoRoot) : path.basename(absoluteInputPath),
      inputRoot: isWithinRepoRoot ? REPO_ROOT : path.dirname(absoluteInputPath),
    },
  };
}

async function writeJsonFileAtomically(outputPath, value) {
  const outputDirectory = path.dirname(outputPath);
  const temporaryPath = `${outputPath}.tmp`;

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, outputPath);
}

function toPosixPath(value) {
  return String(value).split(path.sep).join('/');
}

main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[layout:export-one] ${errorMessage}`);
  process.exitCode = 1;
});
