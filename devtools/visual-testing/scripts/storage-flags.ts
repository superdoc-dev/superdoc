import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBaselineLocalRoot as getCloudBaselineLocalRoot } from './r2-baselines.js';

export type StorageMode = 'cloud' | 'local';

export function parseStorageFlags(args: string[]): { mode: StorageMode; docsDir?: string } {
  const mode: StorageMode = args.includes('--local') ? 'local' : 'cloud';
  const docsIndex = args.indexOf('--docs');
  const docsDir = docsIndex >= 0 ? args[docsIndex + 1] : undefined;
  return { mode, docsDir };
}

export function buildStorageArgs(mode: StorageMode, docsDir?: string): string[] {
  if (mode !== 'local') return [];
  return docsDir ? ['--local', '--docs', docsDir] : ['--local'];
}

export function resolveDocsDir(mode: StorageMode, docsDir?: string): string | undefined {
  if (mode !== 'local') return undefined;
  if (!docsDir) {
    throw new Error('Missing --docs <path> (required when using --local).');
  }
  const resolved = path.resolve(docsDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Docs path not found or not a directory: ${resolved}`);
  }
  return resolved;
}

export function getBaselineOutputRoot(mode: StorageMode, baselineLabel: string): string {
  if (mode === 'local') {
    return path.join('baselines', baselineLabel);
  }
  const tmpRoot = process.env.R2_BASELINES_TMP_DIR ?? path.join(os.tmpdir(), 'superdoc-baselines');
  return path.join(tmpRoot, 'visual', baselineLabel);
}

export function getBaselineLocalRoot(mode: StorageMode, prefix: string): string {
  if (mode === 'local') {
    return path.resolve(prefix);
  }
  return getCloudBaselineLocalRoot(prefix);
}

export function findBaselineVersionsLocal(baselineRoot: string): string[] {
  if (!fs.existsSync(baselineRoot)) return [];
  const entries = fs.readdirSync(baselineRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('v.'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

export function findLatestBaselineLocal(baselineRoot: string): string | null {
  const versions = findBaselineVersionsLocal(baselineRoot);
  return versions.length > 0 ? versions[0] : null;
}
