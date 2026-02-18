import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { format as prettierFormat, resolveConfig as prettierResolveConfig } from 'prettier';

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedCheckIssue {
  kind: 'missing' | 'extra' | 'content';
  path: string;
}

export function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSort(entry));
  }

  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableSort(nested)]);
    return Object.fromEntries(sortedEntries);
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableSort(value), null, 2);
}

export function sha256(value: unknown): string {
  const payload = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function normalizeFileContent(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

async function formatGeneratedContent(file: GeneratedFile): Promise<GeneratedFile> {
  if (!file.path.endsWith('.json')) return file;
  const config = await prettierResolveConfig(resolveWorkspacePath(file.path));
  const formatted = await prettierFormat(file.content, { ...config, parser: 'json' });
  return { ...file, content: formatted };
}

export function resolveWorkspacePath(path: string): string {
  return resolve(process.cwd(), path);
}

export async function writeGeneratedFiles(files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const formatted = await formatGeneratedContent(file);
    const absolutePath = resolveWorkspacePath(formatted.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, normalizeFileContent(formatted.content), 'utf8');
  }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const absoluteRoot = resolveWorkspacePath(root);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(relativePath)));
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(resolveWorkspacePath(path));
    return true;
  } catch {
    return false;
  }
}

export async function checkGeneratedFiles(
  expectedFiles: GeneratedFile[],
  options: {
    roots?: string[];
  } = {},
): Promise<GeneratedCheckIssue[]> {
  const issues: GeneratedCheckIssue[] = [];
  const expected = new Map<string, GeneratedFile>(expectedFiles.map((file) => [file.path, file]));

  for (const [path, file] of expected.entries()) {
    if (!(await pathExists(path))) {
      issues.push({ kind: 'missing', path });
      continue;
    }

    const formatted = await formatGeneratedContent(file);
    const expectedContent = normalizeFileContent(formatted.content);
    const actualContent = await readFile(resolveWorkspacePath(path), 'utf8');
    if (actualContent !== expectedContent) {
      issues.push({ kind: 'content', path });
    }
  }

  const roots = options.roots ?? [];
  const actualFiles = new Set<string>();

  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    const rootFiles = await listFilesRecursive(root);
    for (const path of rootFiles) {
      actualFiles.add(path);
    }
  }

  for (const path of actualFiles) {
    if (!expected.has(path)) {
      issues.push({ kind: 'extra', path });
    }
  }

  return issues.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.path.localeCompare(right.path);
  });
}

export function formatGeneratedCheckIssues(issues: GeneratedCheckIssue[]): string {
  if (issues.length === 0) return '';

  return issues
    .map((issue) => {
      if (issue.kind === 'missing') return `missing generated file: ${issue.path}`;
      if (issue.kind === 'extra') return `unexpected generated file: ${issue.path}`;
      return `stale generated file content: ${issue.path}`;
    })
    .join('\n');
}

export async function runArtifactCheck(
  label: string,
  buildFiles: () => GeneratedFile[],
  roots: string[],
  extraChecks?: (files: GeneratedFile[], issues: GeneratedCheckIssue[]) => Promise<void>,
): Promise<void> {
  const files = buildFiles();
  const issues = await checkGeneratedFiles(files, { roots });

  if (extraChecks) {
    await extraChecks(files, issues);
  }

  if (issues.length > 0) {
    console.error(`${label} check failed`);
    console.error(formatGeneratedCheckIssues(issues));
    process.exitCode = 1;
    return;
  }

  console.log(`${label} check passed (${files.length} files)`);
}

export async function runArtifactGenerate(label: string, buildFiles: () => GeneratedFile[]): Promise<void> {
  const files = buildFiles();
  await writeGeneratedFiles(files);
  console.log(`generated ${label} (${files.length} files)`);
}

export function runScript(label: string, fn: () => Promise<void>): void {
  fn().catch((error) => {
    console.error(`${label} failed with an unexpected error`);
    console.error(error);
    process.exitCode = 1;
  });
}
