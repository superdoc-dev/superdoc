import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { caseDefinitionSchema } from './schema.js';
import type { CaseLoadError, CaseLoadResult, CaseDefinition } from './types.js';

async function walkYamlFiles(dir: string): Promise<string[]> {
  let entries: string[] = [];
  let dirents: Array<import('node:fs').Dirent> = [];

  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      entries = entries.concat(await walkYamlFiles(full));
      continue;
    }
    if (dirent.isFile() && (full.endsWith('.yaml') || full.endsWith('.yml'))) {
      entries.push(full);
    }
  }

  return entries.sort();
}

function formatIssues(error: unknown): Array<{ path: string; message: string }> | undefined {
  if (!error || typeof error !== 'object' || !('issues' in error)) return undefined;
  const issues = (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues;
  return issues.map((issue) => ({
    path: issue.path.length ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

async function parseCaseFile(filePath: string): Promise<CaseDefinition> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parseYaml(raw);

  if (Array.isArray(parsed)) {
    throw new Error('Case files must contain a single case object, not an array.');
  }

  const result = caseDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const error = new Error('Case schema validation failed.');
    (error as Error & { issues?: unknown }).issues = result.error.issues;
    throw error;
  }

  return result.data;
}

/**
 * Recursively loads and validates all YAML case definition files under a directory.
 *
 * @param rootDir - Root directory to search for `.yaml`/`.yml` files.
 * @returns Loaded cases and any validation errors encountered.
 */
export async function loadCases(rootDir: string): Promise<CaseLoadResult> {
  const files = await walkYamlFiles(rootDir);
  const cases: CaseDefinition[] = [];
  const errors: CaseLoadError[] = [];
  const seenIds = new Map<string, string>();

  for (const file of files) {
    try {
      const data = await parseCaseFile(file);
      if (seenIds.has(data.testId)) {
        errors.push({
          filePath: file,
          message: `Duplicate testId "${data.testId}" (already defined in ${seenIds.get(data.testId)}).`,
        });
        continue;
      }
      seenIds.set(data.testId, file);
      cases.push(data);
    } catch (error) {
      errors.push({
        filePath: file,
        message: error instanceof Error ? error.message : String(error),
        issues: formatIssues(error),
      });
    }
  }

  return { cases, errors };
}
