#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
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

function printHelp() {
  console.log(`
Usage:
  node scripts/corpus/push.mjs [--path <relative>] [--folder <name>] [--dry-run] <file.docx>

Options:
      --path <relative>   Relative corpus path (e.g. rendering/sd-1234-fix.docx)
      --folder <name>     Convenience folder prefix when --path is omitted
      --dry-run           Print actions without uploading
  -h, --help              Show this help
`);
}

function parseArgs(argv) {
  const args = {
    filePath: '',
    relativePath: '',
    folder: '',
    dryRun: false,
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

    if (args.dryRun) {
      console.log('[corpus] Dry run complete (no upload performed).');
      return;
    }

    await client.putObjectFromFile(targetRelativePath, absoluteFile, DOCX_CONTENT_TYPE);
    await saveRegistry(client, nextRegistry);

    console.log('[corpus] Upload complete and registry.json updated.');
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
