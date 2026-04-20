import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CACHE_DIR = fileURLToPath(new URL('../.cache/word', import.meta.url));

export function sha256(bytes: Uint8Array | string): string {
  const h = createHash('sha256');
  h.update(bytes);
  return h.digest('hex');
}

export async function hashFile(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function cachePath(sha: string, keySuffix: string): string {
  return join(CACHE_DIR, `${sha}-${keySuffix}.json`);
}

export async function readCache<T>(sha: string, keySuffix: string): Promise<T | null> {
  const p = cachePath(sha, keySuffix);
  try {
    await stat(p);
  } catch {
    return null;
  }
  return JSON.parse(await readFile(p, 'utf8')) as T;
}

export async function writeCache<T>(sha: string, keySuffix: string, value: T): Promise<void> {
  const p = cachePath(sha, keySuffix);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(value), 'utf8');
}
