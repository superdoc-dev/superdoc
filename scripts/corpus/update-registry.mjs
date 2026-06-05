#!/usr/bin/env node

import process from 'node:process';
import {
  REGISTRY_KEY,
  buildDocRelativePath,
  coerceDocEntryFromRelativePath,
  createCorpusR2Client,
  loadRegistryOrNull,
  normalizePath,
  printCorpusEnvHint,
  saveRegistry,
  sha256Buffer,
  sortRegistryDocs,
} from './shared.mjs';

function printHelp() {
  console.log(`
Usage:
  node scripts/corpus/update-registry.mjs [--dry-run]

Description:
  Reconciles registry.json against live R2 .docx keys by removing stale entries
  and adding bucket docs that are missing from the registry.
`);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

async function buildRegistryDocFromBucket(client, relativePath) {
  const buffer = await client.getObjectBuffer(relativePath);
  return {
    ...coerceDocEntryFromRelativePath(relativePath),
    doc_rev: sha256Buffer(buffer),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const client = await createCorpusR2Client();
  try {
    const registry = await loadRegistryOrNull(client);
    if (!registry) {
      throw new Error('registry.json is missing or invalid; cannot reconcile.');
    }

    const docs = Array.isArray(registry.docs) ? registry.docs : [];
    const allObjectKeys = await client.listObjects('');
    const bucketDocPaths = allObjectKeys
      .map((key) => normalizePath(key))
      .filter((key) => key.toLowerCase().endsWith('.docx'));
    const bucketDocPathSet = new Set(bucketDocPaths.map((key) => key.toLowerCase()));

    const registryDocPathSet = new Set();
    const stalePaths = [];
    const nextDocs = [];

    for (const doc of docs) {
      const docPath = normalizePath(buildDocRelativePath(doc));
      if (!docPath.toLowerCase().endsWith('.docx')) {
        nextDocs.push(doc);
        continue;
      }

      registryDocPathSet.add(docPath.toLowerCase());
      if (bucketDocPathSet.has(docPath.toLowerCase())) nextDocs.push(doc);
      else stalePaths.push(docPath);
    }

    const missingRegistryPaths = bucketDocPaths
      .filter((docPath) => !registryDocPathSet.has(docPath.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    console.log(`[corpus] Mode: ${client.mode}`);
    console.log(`[corpus] Account: ${client.accountId}`);
    console.log(`[corpus] Bucket: ${client.bucketName}`);
    console.log(`[corpus] Source: ${REGISTRY_KEY}`);
    console.log(`[corpus] Registry docs: ${docs.length}`);
    console.log(`[corpus] Bucket objects: ${allObjectKeys.length}`);
    console.log(`[corpus] Bucket .docx docs: ${bucketDocPaths.length}`);
    console.log(`[corpus] Registry-only stale docs: ${stalePaths.length}`);
    console.log(`[corpus] Bucket docs missing from registry: ${missingRegistryPaths.length}`);

    if (stalePaths.length === 0 && missingRegistryPaths.length === 0) {
      console.log('[corpus] Registry already in sync.');
      return;
    }

    for (const stalePath of stalePaths) {
      console.log(`[corpus] Removed from registry: ${stalePath}`);
    }

    const addedDocs = [];
    for (const missingPath of missingRegistryPaths) {
      const nextDoc = await buildRegistryDocFromBucket(client, missingPath);
      addedDocs.push(nextDoc);
      console.log(`[corpus] Added to registry: ${missingPath}`);
    }

    const nextRegistry = {
      ...registry,
      updated_at: new Date().toISOString(),
      docs: sortRegistryDocs([...nextDocs, ...addedDocs]),
    };

    if (args.dryRun) {
      console.log(
        `[corpus] Dry run complete. Would add ${addedDocs.length} doc(s) and remove ${stalePaths.length} stale doc(s).`,
      );
      return;
    }

    await saveRegistry(client, nextRegistry);
    console.log(
      `[corpus] registry.json updated. Added ${addedDocs.length} doc(s), removed ${stalePaths.length} stale doc(s).`,
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
