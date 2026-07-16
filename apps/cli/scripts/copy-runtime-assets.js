import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cliRoot, repoRoot, isDirectExecution } from './utils.js';

const BLANK_DOCX_SOURCE = path.join(repoRoot, 'shared', 'common', 'data', 'blank.docx');
const RUNTIME_ASSET_DIR = path.join(cliRoot, 'dist', 'assets');
const RUNTIME_BLANK_DOCX = path.join(RUNTIME_ASSET_DIR, 'blank.docx');

export async function main() {
  await mkdir(RUNTIME_ASSET_DIR, { recursive: true });
  await copyFile(BLANK_DOCX_SOURCE, RUNTIME_BLANK_DOCX);
  console.log('[cli] Copied runtime assets');
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
