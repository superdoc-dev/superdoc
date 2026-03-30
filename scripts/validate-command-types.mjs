#!/usr/bin/env node
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const commandsDir = path.join(repoRoot, 'packages/super-editor/src/editors/v1/core/commands');

async function loadCoreExports() {
  const indexPath = path.join(commandsDir, 'index.js');
  const content = await readFile(indexPath, 'utf8');
  const matches = [...content.matchAll(/export \* from '\.\/([a-zA-Z0-9_-]+)\.js';/g)];
  return matches.map(([, name]) => name);
}

async function loadMappedCommands() {
  const mapPath = path.join(commandsDir, 'core-command-map.d.ts');
  const content = await readFile(mapPath, 'utf8');
  const matches = [...content.matchAll(/\|\s'([a-zA-Z0-9_]+)'/g)];
  return new Set(matches.map(([, name]) => name));
}

async function main() {
  try {
    const exportsList = await loadCoreExports();
    const mapped = await loadMappedCommands();
    const missing = exportsList.filter((name) => !mapped.has(name));

    if (missing.length) {
      console.warn('[validate-command-types] missing type entries:', missing.join(', '));
    } else {
      console.log('[validate-command-types] all core commands mapped ✔');
    }
  } catch (error) {
    console.error('[validate-command-types] failed:', error);
    process.exitCode = 1;
  }
}

main();
