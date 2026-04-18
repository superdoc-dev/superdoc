#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_CORPUS_ROOT,
  REGISTRY_KEY,
  buildDocRelativePath,
  createCorpusR2Client,
  loadRegistryOrNull,
  normalizePath,
  printCorpusEnvHint,
  saveRegistry,
  sortRegistryDocs,
} from './shared.mjs';

const DEFAULT_LOCAL_ROOT = process.env.SUPERDOC_CORPUS_ROOT
  ? path.resolve(process.env.SUPERDOC_CORPUS_ROOT)
  : DEFAULT_CORPUS_ROOT;

function printHelp() {
  console.log(`
Usage:
  node scripts/corpus/delete.mjs [options] <relative.docx> [more.docx...]

Options:
      --path <relative>      Relative corpus path to delete (repeatable)
      --paths-file <path>    Text file with one relative corpus path per line
      --dest <path>          Local corpus root for deleting local copies (default: ${DEFAULT_LOCAL_ROOT})
      --keep-local           Delete from R2 + registry only; leave local files untouched
      --dry-run              Print planned deletions without modifying R2, registry, or local files
  -h, --help                Show this help

Examples:
  pnpm corpus:delete -- basic/advanced-tables.docx
  pnpm corpus:delete -- --path layout/advanced-tables.docx --path pagination/advanced-tables.docx
  pnpm corpus:delete -- --paths-file /tmp/duplicate-docs.txt
`);
}

function normalizeCorpusPath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error('Encountered an empty corpus path.');
  }

  const slashed = raw.replace(/\\/g, '/');
  if (slashed.startsWith('/')) {
    throw new Error(`Corpus paths must be relative: ${value}`);
  }

  const normalized = path.posix.normalize(slashed).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Invalid corpus path: ${value}`);
  }
  if (!normalized.toLowerCase().endsWith('.docx')) {
    throw new Error(`Corpus path must end in .docx: ${value}`);
  }

  return normalizePath(normalized);
}

function readPathsFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function parseArgs(argv) {
  const args = {
    paths: [],
    pathsFiles: [],
    localRoot: DEFAULT_LOCAL_ROOT,
    keepLocal: false,
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
      args.paths.push(next);
      i += 1;
      continue;
    }
    if (arg === '--paths-file' && next) {
      args.pathsFiles.push(next);
      i += 1;
      continue;
    }
    if (arg === '--dest' && next) {
      args.localRoot = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === '--keep-local') {
      args.keepLocal = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      args.paths.push(arg);
      continue;
    }
  }

  for (const filePath of args.pathsFiles) {
    args.paths.push(...readPathsFile(filePath));
  }

  const uniquePaths = [...new Set(args.paths.map((value) => normalizeCorpusPath(value)))];
  if (uniquePaths.length === 0) {
    printHelp();
    throw new Error('Provide at least one .docx corpus path to delete.');
  }

  return {
    ...args,
    paths: uniquePaths.sort((left, right) => left.localeCompare(right)),
  };
}

function pruneRegistryByPaths(registry, paths) {
  const docs = Array.isArray(registry?.docs) ? registry.docs : [];
  const normalizedPathSet = new Set(paths.map((value) => normalizePath(value).toLowerCase()).filter(Boolean));

  const nextDocs = docs.filter((doc) => {
    const docPath = normalizePath(buildDocRelativePath(doc)).toLowerCase();
    return !normalizedPathSet.has(docPath);
  });

  return {
    removedCount: docs.length - nextDocs.length,
    nextRegistry: {
      ...registry,
      updated_at: new Date().toISOString(),
      docs: sortRegistryDocs(nextDocs),
    },
  };
}

function resolveLocalTarget(localRoot, relativePath) {
  const root = path.resolve(localRoot);
  const absolutePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, absolutePath);
  if (
    absolutePath === root ||
    !relativeToRoot ||
    relativeToRoot === '.' ||
    relativeToRoot.startsWith('..') ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Refusing to delete outside local corpus root: ${absolutePath}`);
  }
  return absolutePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = await createCorpusR2Client();

  try {
    const registry = await loadRegistryOrNull(client);
    const objectKeySet = new Set((await client.listObjects('')).map((key) => normalizePath(key).toLowerCase()));

    console.log(`[corpus] Mode: ${client.mode}`);
    console.log(`[corpus] Account: ${client.accountId}`);
    console.log(`[corpus] Bucket: ${client.bucketName}`);
    console.log(`[corpus] Registry: ${registry ? REGISTRY_KEY : 'unavailable (will skip registry update)'}`);
    console.log(`[corpus] Paths requested: ${args.paths.length}`);
    if (!args.keepLocal) {
      console.log(`[corpus] Local root: ${args.localRoot}`);
    }
    if (args.dryRun) {
      console.log('[corpus] Dry run: no changes will be written.');
    }

    let remoteDeleted = 0;
    let remoteMissing = 0;
    let localDeleted = 0;
    let localMissing = 0;

    for (const relativePath of args.paths) {
      const existsInBucket = objectKeySet.has(relativePath.toLowerCase());
      if (existsInBucket) {
        if (args.dryRun) {
          console.log(`[corpus] Would delete remote: ${relativePath}`);
        } else {
          await client.deleteObject(relativePath);
          console.log(`[corpus] Deleted remote: ${relativePath}`);
        }
        remoteDeleted += 1;
      } else {
        console.log(`[corpus] Remote missing: ${relativePath}`);
        remoteMissing += 1;
      }

      if (!args.keepLocal) {
        const localPath = resolveLocalTarget(args.localRoot, relativePath);
        if (fs.existsSync(localPath)) {
          if (args.dryRun) {
            console.log(`[corpus] Would delete local: ${localPath}`);
          } else {
            fs.rmSync(localPath, { force: true });
            console.log(`[corpus] Deleted local: ${localPath}`);
          }
          localDeleted += 1;
        } else {
          console.log(`[corpus] Local missing: ${localPath}`);
          localMissing += 1;
        }
      }
    }

    let registryRemoved = 0;
    if (registry) {
      const { removedCount, nextRegistry } = pruneRegistryByPaths(registry, args.paths);
      registryRemoved = removedCount;
      if (removedCount > 0) {
        if (args.dryRun) {
          console.log(`[corpus] Would remove ${removedCount} path(s) from ${REGISTRY_KEY}.`);
        } else {
          await saveRegistry(client, nextRegistry);
          console.log(`[corpus] Updated ${REGISTRY_KEY}: removed ${removedCount} path(s).`);
        }
      } else {
        console.log(`[corpus] No matching entries in ${REGISTRY_KEY}.`);
      }
    } else {
      console.log(`[corpus] Skipped ${REGISTRY_KEY} update because registry could not be loaded.`);
    }

    console.log(`[corpus] Remote deleted: ${remoteDeleted}`);
    console.log(`[corpus] Remote already missing: ${remoteMissing}`);
    if (!args.keepLocal) {
      console.log(`[corpus] Local deleted: ${localDeleted}`);
      console.log(`[corpus] Local already missing: ${localMissing}`);
    }
    console.log(`[corpus] Registry entries removed: ${registryRemoved}`);
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
