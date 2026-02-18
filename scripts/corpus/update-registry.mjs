#!/usr/bin/env node

import process from 'node:process';
import {
  REGISTRY_KEY,
  buildDocRelativePath,
  createCorpusR2Client,
  loadRegistryOrNull,
  normalizePath,
  printCorpusEnvHint,
  saveRegistry,
  sortRegistryDocs,
} from './shared.mjs';

function printHelp() {
  console.log(`
Usage:
  node scripts/corpus/update-registry.mjs

Description:
  Reconciles registry.json against existing R2 object keys and removes missing doc entries.
`);
}

function parseArgs(argv) {
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
}

async function main() {
  parseArgs(process.argv.slice(2));

  const client = await createCorpusR2Client();
  try {
    const registry = await loadRegistryOrNull(client);
    if (!registry) {
      throw new Error('registry.json is missing or invalid; cannot reconcile.');
    }

    const docs = Array.isArray(registry.docs) ? registry.docs : [];
    const allObjectKeys = await client.listObjects('');
    const objectKeySet = new Set(allObjectKeys.map((key) => normalizePath(key).toLowerCase()));

    const missingPaths = [];
    const nextDocs = [];
    for (const doc of docs) {
      const docPath = normalizePath(buildDocRelativePath(doc));
      if (!docPath.toLowerCase().endsWith('.docx') || objectKeySet.has(docPath.toLowerCase())) {
        nextDocs.push(doc);
      } else {
        missingPaths.push(docPath);
      }
    }

    console.log(`[corpus] Mode: ${client.mode}`);
    console.log(`[corpus] Account: ${client.accountId}`);
    console.log(`[corpus] Bucket: ${client.bucketName}`);
    console.log(`[corpus] Source: ${REGISTRY_KEY}`);
    console.log(`[corpus] Registry docs: ${docs.length}`);
    console.log(`[corpus] Bucket objects: ${allObjectKeys.length}`);
    console.log(`[corpus] Missing registry entries: ${missingPaths.length}`);

    if (missingPaths.length === 0) {
      console.log('[corpus] Registry already in sync.');
      return;
    }

    for (const missingPath of missingPaths) {
      console.log(`[corpus] Removed from registry: ${missingPath}`);
    }

    const nextRegistry = {
      ...registry,
      updated_at: new Date().toISOString(),
      docs: sortRegistryDocs(nextDocs),
    };

    await saveRegistry(client, nextRegistry);
    console.log(`[corpus] registry.json updated. Removed ${missingPaths.length} stale entries.`);
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
