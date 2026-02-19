#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import {
  DOCX_CONTENT_TYPE,
  REGISTRY_KEY,
  buildDocRelativePath,
  coerceDocEntryFromRelativePath,
  createCorpusR2Client,
  loadRegistryOrNull,
  normalizePath,
  printCorpusEnvHint,
  saveRegistry,
  sha256Buffer,
} from './shared.mjs';

const BENCHMARK_REQUIRED_ENV_KEYS = [
  'SD_TESTING_R2_ACCOUNT_ID',
  'SD_TESTING_R2_ACCESS_KEY_ID',
  'SD_TESTING_R2_SECRET_ACCESS_KEY',
  'SD_TESTING_R2_BUCKET_NAME',
  'SD_TESTING_R2_WORD_BUCKET_NAME',
];

function printHelp() {
  console.log(`
Usage:
  node scripts/corpus/push.mjs [--path <relative>] [--folder <name>] [--dry-run] [--no-word-baseline] <file.docx>

Options:
      --path <relative>   Relative corpus path (e.g. rendering/sd-1234-fix.docx)
      --folder <name>     Convenience folder prefix when --path is omitted
      --dry-run           Print actions without uploading
      --no-word-baseline  Skip automatic Word baseline generation/upload
  -h, --help              Show this help
`);
}

function parseArgs(argv) {
  const args = {
    filePath: '',
    relativePath: '',
    folder: '',
    dryRun: false,
    wordBaseline: process.env.SUPERDOC_CORPUS_SKIP_WORD_BASELINE !== '1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--path' && next) {
      args.relativePath = next;
      i += 1;
      continue;
    }
    if (arg === '--folder' && next) {
      args.folder = next;
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--no-word-baseline') {
      args.wordBaseline = false;
      continue;
    }
    if (arg === '--word-baseline') {
      args.wordBaseline = true;
      continue;
    }
    if (!arg.startsWith('--') && !args.filePath) {
      args.filePath = arg;
    }
  }

  if (!args.filePath) {
    printHelp();
    throw new Error('Missing file path.');
  }

  return args;
}

function isCommandAvailable(command) {
  const result = spawnSync(`command -v ${command}`, {
    shell: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function firstNonEmptyEnv(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function buildBenchmarkEnv(baseEnv) {
  const env = { ...baseEnv };

  const accountId = firstNonEmptyEnv(env, [
    'SD_TESTING_R2_ACCOUNT_ID',
    'SUPERDOC_CORPUS_R2_ACCOUNT_ID',
    'SD_VISUAL_TESTING_R2_ACCOUNT_ID',
  ]);
  const accessKeyId = firstNonEmptyEnv(env, [
    'SD_TESTING_R2_ACCESS_KEY_ID',
    'SUPERDOC_CORPUS_R2_ACCESS_KEY_ID',
    'SD_VISUAL_TESTING_R2_ACCESS_KEY_ID',
  ]);
  const secretAccessKey = firstNonEmptyEnv(env, [
    'SD_TESTING_R2_SECRET_ACCESS_KEY',
    'SUPERDOC_CORPUS_R2_SECRET_ACCESS_KEY',
    'SD_VISUAL_TESTING_R2_SECRET_ACCESS_KEY',
  ]);
  const bucketName = firstNonEmptyEnv(env, [
    'SD_TESTING_R2_BUCKET_NAME',
    'SD_TESTING_R2_BUCKET',
    'SUPERDOC_CORPUS_R2_BUCKET',
    'SD_VISUAL_TESTING_R2_BUCKET_NAME',
    'SD_VISUAL_TESTING_R2_BUCKET',
  ]);
  const wordBucketName = firstNonEmptyEnv(env, [
    'SD_TESTING_R2_WORD_BUCKET_NAME',
    'SD_VISUAL_TESTING_R2_WORD_BUCKET_NAME',
    'SUPERDOC_CORPUS_R2_WORD_BUCKET',
  ]);

  if (accountId && !env.SD_TESTING_R2_ACCOUNT_ID) env.SD_TESTING_R2_ACCOUNT_ID = accountId;
  if (accessKeyId && !env.SD_TESTING_R2_ACCESS_KEY_ID) env.SD_TESTING_R2_ACCESS_KEY_ID = accessKeyId;
  if (secretAccessKey && !env.SD_TESTING_R2_SECRET_ACCESS_KEY) env.SD_TESTING_R2_SECRET_ACCESS_KEY = secretAccessKey;
  if (bucketName && !env.SD_TESTING_R2_BUCKET_NAME) env.SD_TESTING_R2_BUCKET_NAME = bucketName;
  if (wordBucketName && !env.SD_TESTING_R2_WORD_BUCKET_NAME) env.SD_TESTING_R2_WORD_BUCKET_NAME = wordBucketName;

  return env;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: false,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      }
    });
  });
}

async function generateAndUploadWordBaseline(targetRelativePath) {
  const benchmarkCommand = 'superdoc-benchmark';
  if (!isCommandAvailable(benchmarkCommand)) {
    throw new Error(
      `Word baseline step requested, but ${benchmarkCommand} was not found in PATH. Install it globally and retry, or rerun with --no-word-baseline.`,
    );
  }

  const args = ['baseline', targetRelativePath, '--force'];
  console.log(`[corpus] Word baseline: ${benchmarkCommand} ${args.join(' ')}`);

  const benchmarkEnv = buildBenchmarkEnv(process.env);
  const missingEnvKeys = BENCHMARK_REQUIRED_ENV_KEYS.filter((key) => !benchmarkEnv[key]);
  if (missingEnvKeys.length > 0) {
    throw new Error(
      `Missing env for Word baseline upload: ${missingEnvKeys.join(', ')}. ` +
        'Set these (or equivalent SUPERDOC_CORPUS_R2_*/SD_VISUAL_TESTING_R2_* vars) and retry.',
    );
  }

  await runCommand(benchmarkCommand, args, {
    env: {
      ...benchmarkEnv,
      SUPERDOC_BENCHMARK_SKIP_UPDATE_CHECK: benchmarkEnv.SUPERDOC_BENCHMARK_SKIP_UPDATE_CHECK ?? '1',
    },
  });

  console.log('[corpus] Word baseline generation/upload complete.');
}

function resolveRelativeTarget({ filePath, relativePath, folder }) {
  if (relativePath) {
    const normalized = normalizePath(relativePath);
    if (!normalized || normalized.startsWith('..')) {
      throw new Error(`Invalid --path value: ${relativePath}`);
    }
    return normalized;
  }

  const filename = path.basename(filePath);
  if (!folder) return filename;
  return normalizePath(path.posix.join(folder, filename));
}

function sortRegistryDocs(docs) {
  return [...docs].sort((a, b) =>
    buildDocRelativePath(a).localeCompare(buildDocRelativePath(b), undefined, {
      sensitivity: 'base',
    }),
  );
}

async function loadExistingRegistryForPush(client) {
  const existing = await loadRegistryOrNull(client);
  if (existing) return existing;

  // listObjects is prefix-based; exact-match filter to avoid false positives.
  const existingKeys = await client.listObjects(REGISTRY_KEY);
  const hasRegistry = existingKeys.some((key) => normalizePath(key) === REGISTRY_KEY);
  if (hasRegistry) {
    throw new Error(
      'Existing registry.json could not be read. Refusing to overwrite registry; fix registry.json and retry.',
    );
  }

  return { updated_at: '', docs: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const absoluteFile = path.resolve(args.filePath);

  if (!fs.existsSync(absoluteFile) || !fs.statSync(absoluteFile).isFile()) {
    throw new Error(`File not found: ${absoluteFile}`);
  }
  if (path.extname(absoluteFile).toLowerCase() !== '.docx') {
    throw new Error('Only .docx files are supported.');
  }

  const targetRelativePath = resolveRelativeTarget({
    filePath: absoluteFile,
    relativePath: args.relativePath,
    folder: args.folder,
  });
  if (!targetRelativePath.toLowerCase().endsWith('.docx')) {
    throw new Error('Target path must end in .docx');
  }

  const fileBuffer = fs.readFileSync(absoluteFile);
  const docBase = coerceDocEntryFromRelativePath(targetRelativePath);
  const nextDoc = {
    ...docBase,
    doc_rev: sha256Buffer(fileBuffer),
  };

  const client = await createCorpusR2Client();

  try {
    const existingRegistry = await loadExistingRegistryForPush(client);
    const docs = Array.isArray(existingRegistry.docs) ? [...existingRegistry.docs] : [];

    const normalizedTarget = normalizePath(targetRelativePath).toLowerCase();
    const indexByPath = docs.findIndex((doc) => buildDocRelativePath(doc).toLowerCase() === normalizedTarget);
    const indexById = docs.findIndex((doc) => doc?.doc_id === nextDoc.doc_id);

    if (indexByPath >= 0) docs[indexByPath] = { ...docs[indexByPath], ...nextDoc };
    else docs.push(nextDoc);

    if (indexById >= 0 && indexById !== indexByPath) {
      docs.splice(indexById, 1);
    }

    const nextRegistry = {
      updated_at: new Date().toISOString(),
      docs: sortRegistryDocs(docs),
    };

    console.log(`[corpus] Mode: ${client.mode}`);
    console.log(`[corpus] Account: ${client.accountId}`);
    console.log(`[corpus] Bucket: ${client.bucketName}`);
    console.log(`[corpus] Uploading: ${absoluteFile}`);
    console.log(`[corpus] Target: ${targetRelativePath}`);
    console.log(`[corpus] doc_id=${nextDoc.doc_id} doc_rev=${nextDoc.doc_rev}`);
    console.log(`[corpus] Word baseline: ${args.wordBaseline ? 'enabled' : 'disabled'}`);

    if (args.dryRun) {
      console.log('[corpus] Dry run complete (no upload performed).');
      return;
    }

    await client.putObjectFromFile(targetRelativePath, absoluteFile, DOCX_CONTENT_TYPE);
    await saveRegistry(client, nextRegistry);

    console.log('[corpus] Upload complete and registry.json updated.');

    if (args.wordBaseline) {
      try {
        await generateAndUploadWordBaseline(targetRelativePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Word baseline generation/upload failed after corpus upload. DOCX + registry were already updated. ` +
            `To retry baseline upload manually: superdoc-benchmark baseline ${targetRelativePath} --force\n` +
            `Details: ${message}`,
        );
      }
    }
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[corpus] Fatal: ${message}`);
  console.error(printCorpusEnvHint());
  process.exit(1);
});
