import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type ImportViolation = {
  filePath: string;
  specifier: string;
  reason: string;
};

const CLI_SRC_ROOT = new URL('../../', import.meta.url);
const CLI_SRC_ROOT_PATH = CLI_SRC_ROOT.pathname;
const BANNED_IMPORT_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /document-api-adapters\//,
    reason: 'CLI modules must not import document-api-adapters internals directly.',
  },
  {
    pattern: /(?:^|\/)super-editor\/src\//,
    reason: 'CLI modules must not import super-editor source internals directly.',
  },
  {
    pattern: /(?:^|\/)layout-engine\/(?:pm-adapter|layout-engine|painters|style-engine)\//,
    reason: 'CLI modules must not import layout-engine internals directly.',
  },
  {
    pattern: /(?:^|\/)prosemirror(?:-|\/)/,
    reason: 'CLI modules must not depend on ProseMirror internals directly.',
  },
];

function listTypeScriptFiles(rootPath: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = readdirSync(currentPath);
    for (const entry of entries) {
      const absolutePath = join(currentPath, entry);
      const info = statSync(absolutePath);
      if (info.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.endsWith('.ts')) continue;
      if (absolutePath.includes('/__tests__/')) continue;
      files.push(absolutePath);
    }
  }

  walk(rootPath);
  return files;
}

function extractImportSpecifiers(fileContents: string): string[] {
  const importSpecifiers: string[] = [];
  const staticImportPattern = /import\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g;
  const sideEffectImportPattern = /import\s+['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [staticImportPattern, sideEffectImportPattern, dynamicImportPattern]) {
    for (const match of fileContents.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) importSpecifiers.push(specifier);
    }
  }

  return importSpecifiers;
}

function findImportViolations(): ImportViolation[] {
  const files = listTypeScriptFiles(CLI_SRC_ROOT_PATH);
  const violations: ImportViolation[] = [];

  for (const filePath of files) {
    const contents = readFileSync(filePath, 'utf8');
    const specifiers = extractImportSpecifiers(contents);

    for (const specifier of specifiers) {
      for (const { pattern, reason } of BANNED_IMPORT_PATTERNS) {
        if (!pattern.test(specifier)) continue;
        violations.push({ filePath, specifier, reason });
      }
    }
  }

  return violations;
}

describe('cli import boundaries', () => {
  test('prevents adapter and engine-internal imports outside bridge modules', () => {
    const violations = findImportViolations();
    const details = violations.map((entry) => ({
      filePath: entry.filePath.replace(CLI_SRC_ROOT_PATH, 'src/'),
      specifier: entry.specifier,
      reason: entry.reason,
    }));

    expect(details).toEqual([]);
  });
});
