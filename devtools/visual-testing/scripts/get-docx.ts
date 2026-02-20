#!/usr/bin/env tsx

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { colors } from './terminal.js';
import { createCorpusProvider, resolveDocumentPath } from './corpus-provider.js';

function printHelp(): void {
  console.log(
    `\nUsage: pnpm get-docx <folder/file.docx> [--out <path>] [--dry-run]\n\nDefaults:\n  --out defaults to a temp folder under ${os.tmpdir()}\n\nOptions:\n  --out <path>  Write the downloaded file to this path\n+  --dry-run     Print the destination without downloading\n`,
  );
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  const cleaned = path.posix.normalize(normalized);
  if (!cleaned || cleaned.startsWith('../') || cleaned === '..') {
    throw new Error(`Invalid document path: ${value}`);
  }
  return cleaned;
}

function parseArgs(): { docPath: string; outPath?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let docPath: string | undefined;
  let outPath: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out' && args[i + 1]) {
      outPath = args[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--') && !docPath) {
      docPath = arg;
    }
  }

  if (!docPath) {
    printHelp();
    throw new Error('Missing document path.');
  }

  return { docPath, outPath, dryRun };
}

async function main(): Promise<void> {
  const { docPath, outPath, dryRun } = parseArgs();
  const relative = normalizeRelativePath(docPath);

  const defaultRoot = path.join(os.tmpdir(), 'superdoc-docx');
  const destination = outPath ? path.resolve(outPath) : path.join(defaultRoot, relative);

  if (!destination.toLowerCase().endsWith('.docx')) {
    throw new Error('Destination path must end with .docx.');
  }

  if (dryRun) {
    console.log(colors.info(`Would download: ${relative}`));
    console.log(colors.info(`Destination: ${destination}`));
    return;
  }

  const provider = await createCorpusProvider({ mode: 'cloud' });
  const sourcePath = await resolveDocumentPath(provider, relative);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(sourcePath, destination);

  console.log(colors.success(`✅ Downloaded ${relative}`));
  console.log(colors.info(`📁 Saved to: ${destination}`));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error(colors.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
    process.exitCode = 1;
  });
}
