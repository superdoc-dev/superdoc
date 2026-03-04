#!/usr/bin/env tsx

import path from 'node:path';
import { colors } from './terminal.js';
import { buildDocRelativePath, createCorpusProvider } from './corpus-provider.js';
import { parseStorageFlags, resolveDocsDir } from './storage-flags.js';

const VALID_EXTENSIONS = new Set(['.docx']);

async function main(): Promise<void> {
  const storage = parseStorageFlags(process.argv.slice(2));
  const docsDir = resolveDocsDir(storage.mode, storage.docsDir);
  const provider = await createCorpusProvider({ mode: storage.mode, docsDir });
  const docs = await provider.listDocs({ filters: [], matches: [], excludes: [] });

  const roots = new Set<string>();
  let rootDocs = 0;

  for (const doc of docs) {
    const relative = buildDocRelativePath(doc);
    const ext = path.extname(relative).toLowerCase();
    if (!VALID_EXTENSIONS.has(ext)) continue;

    const parts = relative.split('/');
    if (parts.length > 1) {
      roots.add(parts[0]);
    } else if (parts.length === 1) {
      rootDocs += 1;
    }
  }

  const sorted = Array.from(roots).sort();
  if (sorted.length === 0 && rootDocs === 0) {
    console.log(colors.warning('No documents found in corpus.'));
    return;
  }

  console.log(colors.info('Filterable folders:'));
  for (const name of sorted) {
    console.log(colors.muted(`- ${name}`));
  }
  if (rootDocs > 0) {
    console.log(colors.muted('- (root)'));
  }

  console.log('');
  console.log(colors.info('Example: pnpm generate --filter layout'));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  });
}
