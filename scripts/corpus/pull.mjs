#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_CORPUS_ROOT,
  REGISTRY_KEY,
  REPO_ROOT,
  applyPathFilters,
  buildDocRelativePath,
  coerceDocEntryFromRelativePath,
  createCorpusR2Client,
  ensureVisualTestDataSymlink,
  formatDurationMs,
  loadRegistryOrNull,
  normalizePath,
  printCorpusEnvHint,
  saveRegistry,
  sortRegistryDocs,
} from './shared.mjs';

const VISUAL_LEGACY_PATH_MAP = {
  'behavior/importing/sd-1558-fld-char-issue.docx': 'fldchar/sd-1558-fld-char-issue.docx',
  'behavior/comments-tcs/nested-comments-gdocs.docx': 'comments-tcs/nested-comments-gdocs.docx',
  'behavior/comments-tcs/nested-comments-word.docx': 'comments-tcs/nested-comments-word.docx',
  'behavior/comments-tcs/sd-tracked-style-change.docx': 'comments-tcs/SD Tracked style change.docx',
  'behavior/comments-tcs/tracked-changes.docx': 'comments-tcs/tracked-changes.docx',
  'behavior/comments-tcs/gdocs-comment-on-change.docx': 'comments-tcs/gdocs-comment-on-change.docx',
  'behavior/lists/sd-1658-lists-same-level.docx': 'lists/sd-1658-lists-same-level.docx',
  'behavior/lists/sd-1543-empty-list-items.docx': 'lists/sd-1543-empty-list-items.docx',
  'behavior/formatting/sd-1778-apply-font.docx': 'other/sd-1778-apply-font.docx',
  'behavior/formatting/sd-1727-formatting-lost.docx': 'styles/sd-1727-formatting-lost.docx',
  'behavior/headers/longer-header.docx': 'basic/longer-header.docx',
  'behavior/basic-commands/h_f-normal-odd-even.docx': 'pagination/h_f-normal-odd-even.docx',
  'rendering/advanced-tables.docx': 'basic/advanced-tables.docx',
};

function printHelp() {
  console.log(`
Usage:
  node scripts/corpus/pull.mjs [options]

Options:
      --dest <path>        Local destination root (default: ${DEFAULT_CORPUS_ROOT})
      --filter <prefix>    Prefix filter (repeatable)
      --match <text>       Substring filter (repeatable)
      --exclude <prefix>   Exclude filter (repeatable)
      --force              Re-download files even if they already exist
      --link-visual        Point tests/visual/test-data at --dest via symlink
      --dry-run            Print actions without downloading
  -h, --help               Show this help
`);
}

function parseArgs(argv) {
  const args = {
    dest: DEFAULT_CORPUS_ROOT,
    filters: [],
    matches: [],
    excludes: [],
    force: false,
    linkVisual: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--dest' && next) {
      args.dest = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === '--filter' && next) {
      args.filters.push(normalizePath(next));
      i += 1;
      continue;
    }
    if (arg === '--match' && next) {
      args.matches.push(String(next));
      i += 1;
      continue;
    }
    if (arg === '--exclude' && next) {
      args.excludes.push(normalizePath(next));
      i += 1;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--link-visual') {
      args.linkVisual = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
  }

  return args;
}

async function loadCorpusDocs(client) {
  const registry = await loadRegistryOrNull(client);
  if (registry?.docs?.length) {
    return {
      source: REGISTRY_KEY,
      registry,
      docs: registry.docs
        .map((doc) => {
          const relativePath = buildDocRelativePath(doc);
          return {
            ...doc,
            relative_path: relativePath,
            object_key: relativePath,
          };
        })
        .filter((doc) => doc.relative_path && doc.relative_path.toLowerCase().endsWith('.docx')),
    };
  }

  const legacyKeys = await client.listObjects('documents/');
  const docs = legacyKeys
    .filter((key) => key.toLowerCase().endsWith('.docx'))
    .map((key) => {
      const objectKey = normalizePath(key);
      const relativePath = normalizePath(key.replace(/^documents\//, ''));
      return {
        ...coerceDocEntryFromRelativePath(relativePath),
        relative_path: relativePath,
        object_key: objectKey,
      };
    });

  return {
    source: 'documents/ (legacy prefix fallback)',
    registry: null,
    docs,
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

function isMissingObjectError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /specified key does not exist|NoSuchKey|The specified key does not exist/i.test(message)
    || (error?.['$metadata']?.httpStatusCode === 404);
}

function ensureLegacyVisualAliases(destinationRoot) {
  let aliasCount = 0;
  for (const [legacyRelative, canonicalRelative] of Object.entries(VISUAL_LEGACY_PATH_MAP)) {
    const sourcePath = path.join(destinationRoot, canonicalRelative);
    if (!fs.existsSync(sourcePath)) continue;

    const aliasPath = path.join(destinationRoot, legacyRelative);
    if (fs.existsSync(aliasPath)) continue;

    fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
    const symlinkTarget = path.relative(path.dirname(aliasPath), sourcePath);
    fs.symlinkSync(symlinkTarget, aliasPath);
    aliasCount += 1;
  }
  return aliasCount;
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const destinationRoot = path.resolve(args.dest);

  const destinationRelative = path.relative(REPO_ROOT, destinationRoot);
  if (
    destinationRoot === REPO_ROOT ||
    !destinationRelative ||
    destinationRelative === '.' ||
    destinationRelative.startsWith('..')
  ) {
    throw new Error(`Refusing to write corpus outside repo root: ${destinationRoot}`);
  }

  const client = await createCorpusR2Client();

  try {
    console.log(`[corpus] Mode: ${client.mode}`);
    console.log(`[corpus] Account: ${client.accountId}`);
    console.log(`[corpus] Bucket: ${client.bucketName}`);

    const corpus = await loadCorpusDocs(client);
    const relativePaths = corpus.docs.map((doc) => normalizePath(doc.relative_path)).filter(Boolean);
    const selected = applyPathFilters(relativePaths, {
      filters: args.filters,
      matches: args.matches,
      excludes: args.excludes,
    });

    const selectedSet = new Set(selected);
    let selectedDocs = corpus.docs.filter((doc) => selectedSet.has(normalizePath(doc.relative_path)));
    let missingRegistryPaths = [];

    if (selectedDocs.length === 0) {
      console.log('[corpus] No docs matched filters.');
      return;
    }

    fs.mkdirSync(destinationRoot, { recursive: true });

    let downloaded = 0;
    let skipped = 0;

    console.log(`[corpus] Source: ${corpus.source}`);
    console.log(`[corpus] Destination: ${destinationRoot}`);
    console.log(`[corpus] Matched docs: ${selectedDocs.length}`);

    if (corpus.source === REGISTRY_KEY && corpus.registry) {
      const allObjectKeys = await client.listObjects('');
      const objectKeySet = new Set(allObjectKeys.map((key) => normalizePath(key).toLowerCase()));
      const existingDocs = [];
      const missingDocs = [];

      for (const doc of selectedDocs) {
        const objectKey = normalizePath(doc.object_key ?? doc.relative_path).toLowerCase();
        if (objectKeySet.has(objectKey)) existingDocs.push(doc);
        else missingDocs.push(doc);
      }

      if (missingDocs.length > 0) {
        missingRegistryPaths = missingDocs.map((doc) => normalizePath(doc.relative_path));
        selectedDocs = existingDocs;
        console.log(`[corpus] Missing objects in bucket: ${missingDocs.length}.`);
        for (const missingPath of missingRegistryPaths) {
          console.log(`[corpus] Missing key: ${missingPath}`);
        }
      }
    }

    for (const doc of selectedDocs) {
      const relativePath = normalizePath(doc.relative_path);
      const objectKey = normalizePath(doc.object_key ?? relativePath);
      const destinationPath = path.join(destinationRoot, relativePath);

      if (!args.force && fs.existsSync(destinationPath)) {
        skipped += 1;
        continue;
      }

      if (args.dryRun) {
        console.log(`- ${relativePath}`);
        downloaded += 1;
        continue;
      }

      try {
        await client.getObjectToFile(objectKey, destinationPath);
        downloaded += 1;
      } catch (error) {
        if (isMissingObjectError(error) && corpus.source === REGISTRY_KEY && corpus.registry) {
          missingRegistryPaths.push(relativePath);
          console.log(`[corpus] Missing key during download: ${relativePath}`);
          continue;
        }
        throw error;
      }

      if (downloaded % 25 === 0 || downloaded === selectedDocs.length) {
        console.log(`[corpus] Downloaded ${downloaded}/${selectedDocs.length}`);
      }
    }

    if (missingRegistryPaths.length > 0 && corpus.source === REGISTRY_KEY && corpus.registry && !args.dryRun) {
      const uniqueMissing = [...new Set(missingRegistryPaths.map((value) => normalizePath(value).toLowerCase()))];
      const { removedCount, nextRegistry } = pruneRegistryByPaths(corpus.registry, uniqueMissing);
      if (removedCount > 0) {
        await saveRegistry(client, nextRegistry);
        console.log(`[corpus] Pruned ${removedCount} missing path(s) from registry.json.`);
      }
    }

    if (args.linkVisual && !args.dryRun) {
      const aliasesAdded = ensureLegacyVisualAliases(destinationRoot);
      if (aliasesAdded > 0) {
        console.log(`[corpus] Added ${aliasesAdded} visual legacy alias path(s).`);
      }

      const link = ensureVisualTestDataSymlink(destinationRoot);
      if (link.changed) {
        console.log(
          `[corpus] Linked tests/visual/test-data -> ${destinationRoot}${link.backupPath ? ` (backup: ${link.backupPath})` : ''}`,
        );
      } else {
        console.log('[corpus] tests/visual/test-data already linked to shared corpus root.');
      }
    }

    if (args.linkVisual && args.dryRun) {
      console.log('[corpus] Dry run: skipped visual symlink/alias updates.');
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[corpus] Done. Downloaded: ${downloaded}, Skipped: ${skipped}, Missing: ${missingRegistryPaths.length}, Elapsed: ${formatDurationMs(elapsed)}`,
    );
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
