#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import { colors } from './terminal.js';
import { buildDocRelativePath, createCorpusProvider, type CorpusFilters } from './corpus-provider.js';

function printHelp(): void {
  console.log(
    `\nUsage: pnpm get-corpus [dest] [--filter <name>] [--match <text>] [--exclude <name>] [--dry-run]\n\nDefaults:\n  dest = ./test-docs\n\nOptions:\n  --filter <name>   Prefix filter (repeatable)\n  --match <text>    Substring match filter (repeatable)\n  --exclude <name>  Exclude filter (repeatable)\n  --dry-run         Print actions without downloading\n`,
  );
}

function parseArgs(): {
  dest: string;
  filters: string[];
  matches: string[];
  excludes: string[];
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let dest: string | undefined;
  const filters: string[] = [];
  const matches: string[] = [];
  const excludes: string[] = [];
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--filter' && args[i + 1]) {
      const value = args[i + 1].trim();
      if (value) filters.push(value);
      i += 1;
    } else if (arg === '--match' && args[i + 1]) {
      const value = args[i + 1].trim();
      if (value) matches.push(value);
      i += 1;
    } else if (arg === '--exclude' && args[i + 1]) {
      const value = args[i + 1].trim();
      if (value) excludes.push(value);
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--') && !dest) {
      dest = arg;
    }
  }

  return { dest: dest ?? 'test-docs', filters, matches, excludes, dryRun };
}

function ensureDestination(destRoot: string): void {
  if (fs.existsSync(destRoot)) {
    if (!fs.statSync(destRoot).isDirectory()) {
      throw new Error(`Destination is not a directory: ${destRoot}`);
    }
    return;
  }
  fs.mkdirSync(destRoot, { recursive: true });
}

async function main(): Promise<void> {
  const { dest, filters, matches, excludes, dryRun } = parseArgs();
  const destRoot = path.resolve(dest);
  ensureDestination(destRoot);

  const provider = await createCorpusProvider({ mode: 'cloud' });
  const filterSpec: CorpusFilters = { filters, matches, excludes };
  const docs = await provider.listDocs(filterSpec);

  if (docs.length === 0) {
    console.log(colors.warning('No corpus documents matched the filters.'));
    return;
  }

  console.log(colors.info(`Downloading ${docs.length} document(s) to ${destRoot}...`));

  let downloaded = 0;
  for (const doc of docs) {
    const relativePath = buildDocRelativePath(doc);
    const targetPath = path.join(destRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    console.log(colors.muted(`- ${relativePath}`));

    if (dryRun) continue;

    const sourcePath = await provider.fetchDoc(doc.doc_id, doc.doc_rev);
    fs.copyFileSync(sourcePath, targetPath);
    downloaded += 1;
  }

  if (dryRun) {
    console.log(colors.success(`✅ Dry run complete (${docs.length} match(es)).`));
    return;
  }

  console.log(colors.success(`✅ Downloaded ${downloaded} document(s).`));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  });
}
