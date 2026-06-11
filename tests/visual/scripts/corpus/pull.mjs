#!/usr/bin/env node

import 'dotenv/config';
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
  seedCorpusFromPrimary,
  sortRegistryDocs,
  writeProgressBar,
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
  pnpm --dir tests/visual docs:download [-- options]
  node tests/visual/scripts/corpus/pull.mjs [options]

Options:
      --dest <path>        Local destination root (default: ${DEFAULT_CORPUS_ROOT})
      --filter <prefix>    Prefix filter (repeatable)
      --match <text>       Substring filter (repeatable)
      --exclude <prefix>   Exclude filter (repeatable)
      --include-unregistered
                           Merge live bucket .docx objects that are missing from
                           registry.json (useful for fresh uploads / scratch paths)
      --force              Re-download files even if they already exist
      --no-seed            In a git worktree, skip hardlinking from the primary
                           repo's corpus before pulling from R2
      --link-visual        Point tests/visual/test-data at --dest via symlink
      --dry-run            Print actions without downloading
      --quiet              Suppress verbose logs; show only progress and summary
  -h, --help               Show this help
`);
}

function parseArgs(argv) {
  const args = {
    dest: DEFAULT_CORPUS_ROOT,
    filters: [],
    matches: [],
    excludes: [],
    includeUnregistered: false,
    force: false,
    linkVisual: false,
    dryRun: false,
    quiet: false,
    seedFromPrimary: true,
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
    if (arg === '--include-unregistered') {
      args.includeUnregistered = true;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--no-seed') {
      args.seedFromPrimary = false;
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
    if (arg === '--quiet' || arg === '-q') {
      args.quiet = true;
      continue;
    }
  }

  return args;
}

function buildLiveDocEntry(relativePath, objectKey = relativePath) {
  const normalizedPath = normalizePath(relativePath);
  return {
    ...coerceDocEntryFromRelativePath(normalizedPath),
    relative_path: normalizedPath,
    object_key: normalizePath(objectKey),
  };
}

async function listLiveBucketDocs(client) {
  const allObjectKeys = await client.listObjects('');
  return sortRegistryDocs(
    allObjectKeys
      .map((key) => normalizePath(key))
      .filter((key) => key.toLowerCase().endsWith('.docx'))
      .map((key) => buildLiveDocEntry(key, key)),
  );
}

async function findUnregisteredBucketMatches(client, filterOptions, knownRelativePaths) {
  const knownPathSet = new Set(knownRelativePaths.map((value) => normalizePath(value).toLowerCase()).filter(Boolean));
  const liveRelativePaths = (await client.listObjects(''))
    .map((key) => normalizePath(key))
    .filter((key) => key.toLowerCase().endsWith('.docx'));

  return applyPathFilters(liveRelativePaths, filterOptions).filter((value) => !knownPathSet.has(value.toLowerCase()));
}

async function loadCorpusDocs(client, { includeUnregistered = false } = {}) {
  const registry = await loadRegistryOrNull(client);
  const registryDocs =
    registry?.docs?.length
      ? registry.docs
          .map((doc) => {
            const relativePath = buildDocRelativePath(doc);
            return {
              ...doc,
              relative_path: relativePath,
              object_key: relativePath,
            };
          })
          .filter((doc) => doc.relative_path && doc.relative_path.toLowerCase().endsWith('.docx'))
      : [];

  if (registryDocs.length > 0 && !includeUnregistered) {
    return {
      source: REGISTRY_KEY,
      registry,
      docs: registryDocs,
    };
  }

  if (includeUnregistered) {
    const liveDocs = await listLiveBucketDocs(client);

    if (registryDocs.length === 0) {
      return {
        source: 'live bucket .docx listing',
        registry,
        docs: liveDocs,
      };
    }

    const mergedDocsByPath = new Map();
    for (const doc of registryDocs) {
      mergedDocsByPath.set(normalizePath(doc.relative_path).toLowerCase(), doc);
    }
    for (const liveDoc of liveDocs) {
      const pathKey = normalizePath(liveDoc.relative_path).toLowerCase();
      const existingDoc = mergedDocsByPath.get(pathKey);
      if (existingDoc) {
        mergedDocsByPath.set(pathKey, {
          ...liveDoc,
          ...existingDoc,
          relative_path: liveDoc.relative_path,
          object_key: liveDoc.object_key,
        });
      } else {
        mergedDocsByPath.set(pathKey, liveDoc);
      }
    }

    return {
      source: `${REGISTRY_KEY} + live bucket .docx merge`,
      registry,
      docs: sortRegistryDocs([...mergedDocsByPath.values()]),
    };
  }

  const legacyKeys = await client.listObjects('documents/');
  const docs = legacyKeys
    .filter((key) => key.toLowerCase().endsWith('.docx'))
    .map((key) => buildLiveDocEntry(key.replace(/^documents\//, ''), key));

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
    if (!args.quiet) {
      console.log(`[corpus] Mode: ${client.mode}`);
      console.log(`[corpus] Account: ${client.accountId}`);
      console.log(`[corpus] Bucket: ${client.bucketName}`);
    }

    const corpus = await loadCorpusDocs(client, {
      includeUnregistered: args.includeUnregistered,
    });
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
      if (corpus.docs.length === 0) {
        console.error('[corpus] Registry returned 0 documents. Auth may be expired — run: npx wrangler login');
        process.exit(1);
      }
      if (!args.includeUnregistered && corpus.source === REGISTRY_KEY) {
        const unregisteredMatches = await findUnregisteredBucketMatches(
          client,
          {
            filters: args.filters,
            matches: args.matches,
            excludes: args.excludes,
          },
          relativePaths,
        );
        if (unregisteredMatches.length > 0) {
          console.log(
            `[corpus] No docs matched filters in registry.json, but ${unregisteredMatches.length} live bucket doc(s) do match.`,
          );
          console.log('[corpus] Re-run with --include-unregistered to pull them.');
          return;
        }
      }
      console.log('[corpus] No docs matched filters.');
      return;
    }

    fs.mkdirSync(destinationRoot, { recursive: true });

    let downloaded = 0;
    let skipped = 0;
    let seeded = 0;

    if (!args.quiet) {
      console.log(`[corpus] Source: ${corpus.source}`);
      console.log(`[corpus] Destination: ${destinationRoot}`);
      console.log(`[corpus] Corpus size: ${selectedDocs.length} documents`);
    }

    // Fast path for git worktrees: hardlink from the primary repo's corpus
    // before reaching for R2. Downloads below still run for anything the
    // primary is missing, so --force or a fresh fixture still trigger R2.
    if (args.seedFromPrimary && !args.force && !args.dryRun) {
      seeded = seedCorpusFromPrimary(destinationRoot, selectedDocs, { quiet: args.quiet });
    }

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
        if (!args.quiet) {
          console.log(`[corpus] Missing objects in bucket: ${missingDocs.length}.`);
          for (const missingPath of missingRegistryPaths) {
            console.log(`[corpus] Missing key: ${missingPath}`);
          }
        }
      }
    }

    const total = selectedDocs.length;
    const isTTY = process.stdout.isTTY;
    const CONCURRENCY = 8;

    // Pre-filter skipped/dry-run docs synchronously, then download the rest in parallel
    const toDownload = [];
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

      toDownload.push({ relativePath, objectKey, destinationPath });
    }

    if (isTTY && (skipped > 0 || downloaded > 0)) writeProgressBar(downloaded + skipped, total, null);

    if (toDownload.length > 0) {
      let nextIndex = 0;
      let firstError = null;
      const downloadStartedAt = Date.now();

      async function worker() {
        while (nextIndex < toDownload.length) {
          const idx = nextIndex++;
          const { relativePath, objectKey, destinationPath } = toDownload[idx];

          try {
            // Unlink before writing. If the destination is a hardlink to the
            // primary repo's corpus (seeded above), wrangler's r2 object get
            // would otherwise write through and mutate the primary's file.
            try {
              fs.rmSync(destinationPath, { force: true });
            } catch {
              // swallow — the write below will surface any real permission issue
            }
            await client.getObjectToFile(objectKey, destinationPath);
            downloaded += 1;
          } catch (error) {
            if (isMissingObjectError(error) && corpus.source === REGISTRY_KEY && corpus.registry) {
              missingRegistryPaths.push(relativePath);
              if (!args.quiet) {
                if (isTTY) process.stdout.write('\n');
                console.log(`[corpus] Missing key during download: ${relativePath}`);
              }
              continue;
            }
            if (!firstError) firstError = error;
            return;
          }

          if (isTTY) {
            writeProgressBar(downloaded + skipped, total, downloadStartedAt);
          } else if (downloaded % 25 === 0 || downloaded === toDownload.length) {
            console.log(`[corpus] Downloaded ${downloaded}/${total}`);
          }
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, toDownload.length) }, () => worker());
      await Promise.all(workers);
      if (firstError) throw firstError;
    }

    if (isTTY && total > 0) process.stdout.write('\n');

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
      if (!args.quiet && aliasesAdded > 0) {
        console.log(`[corpus] Added ${aliasesAdded} visual legacy alias path(s).`);
      }

      const link = ensureVisualTestDataSymlink(destinationRoot);
      if (!args.quiet) {
        if (link.changed) {
          console.log(
            `[corpus] Linked tests/visual/test-data -> ${destinationRoot}${link.backupPath ? ` (backup: ${link.backupPath})` : ''}`,
          );
        } else {
          console.log('[corpus] tests/visual/test-data already linked to shared corpus root.');
        }
      }
    }

    if (args.linkVisual && args.dryRun && !args.quiet) {
      console.log('[corpus] Dry run: skipped visual symlink/alias updates.');
    }

    const elapsed = Date.now() - startedAt;
    if (args.quiet) {
      if (downloaded > 0 || seeded > 0) {
        const parts = [];
        if (seeded > 0) parts.push(`${seeded} seeded`);
        if (downloaded > 0) parts.push(`${downloaded} downloaded`);
        console.log(`[corpus] Synced ${parts.join(' + ')} in ${formatDurationMs(elapsed)}`);
      }
    } else {
      const seedPart = seeded > 0 ? `, Seeded: ${seeded}` : '';
      console.log(
        `[corpus] Done. Downloaded: ${downloaded}${seedPart}, Skipped: ${skipped}, Missing: ${missingRegistryPaths.length}, Elapsed: ${formatDurationMs(elapsed)}`,
      );
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
