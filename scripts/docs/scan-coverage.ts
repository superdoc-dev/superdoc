#!/usr/bin/env bun
/**
 * Documentation Coverage Scanner
 *
 * Scans super-editor exports and compares against MDX documentation files.
 * Generates a coverage report showing documented vs undocumented exports.
 * Filters out exports marked with @internal JSDoc tags.
 *
 * Usage: bun scripts/docs/scan-coverage.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const ROOT = join(import.meta.dir, '../..');
const SUPER_EDITOR_SRC = join(ROOT, 'packages/super-editor/src');
const DOCS_DIR = join(ROOT, 'apps/docs');

interface ExportInfo {
  name: string;
  source: string;
  type: 'extension' | 'class' | 'helper' | 'component' | 'other';
  hasDoc: boolean;
  isInternal: boolean;
}

interface CoverageReport {
  total: number;
  internal: number;
  public: number;
  documented: number;
  undocumented: number;
  percentage: number;
  exports: ExportInfo[];
}

/**
 * Parse export statements from a JavaScript file, detecting @internal tags
 */
function parseExports(filePath: string): { name: string; isInternal: boolean }[] {
  const content = readFileSync(filePath, 'utf-8');
  const results: { name: string; isInternal: boolean }[] = [];

  // Parse export blocks: export { ... }
  // We need line-by-line analysis to detect /** @internal */ comments
  const lines = content.split('\n');
  let inExportBlock = false;
  let nextIsInternal = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('export {') || trimmed.startsWith('export{')) {
      inExportBlock = true;
      // Check if single-line export
      if (trimmed.includes('}')) {
        const names = trimmed
          .replace(/export\s*\{/, '')
          .replace(/\}.*/, '')
          .split(',')
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)[0]
              .trim(),
          )
          .filter((s) => s && !s.startsWith('//') && !s.startsWith('/**'));
        for (const name of names) {
          results.push({ name, isInternal: false });
        }
        inExportBlock = false;
      }
      continue;
    }

    if (inExportBlock) {
      if (trimmed === '}' || trimmed === '};') {
        inExportBlock = false;
        nextIsInternal = false;
        continue;
      }

      // Detect @internal comment
      if (trimmed.includes('@internal')) {
        nextIsInternal = true;
        continue;
      }

      // Skip pure comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/**') || trimmed.startsWith('*')) {
        continue;
      }

      // Extract export name
      const name = trimmed
        .replace(/,\s*$/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (name && name !== '') {
        results.push({ name, isInternal: nextIsInternal });
        nextIsInternal = false;
      }
    }
  }

  // Also match: export const Name = ...
  let match;
  const exportConstRegex = /export\s+const\s+(\w+)/g;
  while ((match = exportConstRegex.exec(content)) !== null) {
    if (!results.find((r) => r.name === match![1])) {
      results.push({ name: match[1], isInternal: false });
    }
  }

  // Match: export function Name(...
  const exportFuncRegex = /export\s+function\s+(\w+)/g;
  while ((match = exportFuncRegex.exec(content)) !== null) {
    if (!results.find((r) => r.name === match![1])) {
      results.push({ name: match[1], isInternal: false });
    }
  }

  // Match: export class Name
  const exportClassRegex = /export\s+class\s+(\w+)/g;
  while ((match = exportClassRegex.exec(content)) !== null) {
    if (!results.find((r) => r.name === match![1])) {
      results.push({ name: match[1], isInternal: false });
    }
  }

  // Dedupe by name (keep first occurrence)
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
}

/**
 * Recursively get all MDX files from a directory
 */
function getMdxFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getMdxFiles(fullPath));
    } else if (entry.name.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Get all documented exports from MDX files across all docs directories
 */
function getDocumentedExports(): Set<string> {
  const documented = new Set<string>();

  const mdxFiles = getMdxFiles(DOCS_DIR);
  for (const filePath of mdxFiles) {
    // Add filename as a documented name (e.g., "bold.mdx" → "bold")
    const name = basename(filePath, '.mdx');
    documented.add(name.toLowerCase());

    const content = readFileSync(filePath, 'utf-8');

    // Match frontmatter title and keywords
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1];
      const titleMatch = fm.match(/title:\s*(.+)/);
      if (titleMatch) {
        for (const word of titleMatch[1].replace(/["']/g, '').split(/\s+/)) {
          if (word.length > 1) documented.add(word.toLowerCase());
        }
      }
      const kwMatch = fm.match(/keywords:\s*"([^"]+)"/);
      if (kwMatch) {
        for (const kw of kwMatch[1].split(',')) {
          for (const word of kw.trim().split(/\s+/)) {
            if (word.length > 1) documented.add(word.toLowerCase());
          }
        }
      }
    }

    // Match backtick-quoted identifiers: `SuperConverter`, `Editor`, etc.
    for (const match of content.matchAll(/`(\w+)`/g)) {
      documented.add(match[1].toLowerCase());
    }

    // Match import statements: import { X, Y } from 'superdoc'
    for (const match of content.matchAll(/import\s*\{([^}]+)\}/g)) {
      const names = match[1].split(',').map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      );
      for (const n of names) {
        if (n) documented.add(n.toLowerCase());
      }
    }

    // Match destructuring: const { X, Y } = helpers
    for (const match of content.matchAll(/const\s*\{([^}]+)\}/g)) {
      const names = match[1].split(',').map((s) => s.trim().split(/\s*:/)[0].trim());
      for (const n of names) {
        if (n) documented.add(n.toLowerCase());
      }
    }
  }

  return documented;
}

/**
 * Categorize an export based on naming conventions
 */
function categorizeExport(name: string): ExportInfo['type'] {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('helper')) return 'helper';
  if (lowerName.includes('editor') || lowerName.includes('converter')) return 'class';
  if (
    lowerName.endsWith('vue') ||
    ['SuperEditor', 'Toolbar', 'SlashMenu', 'AIWriter', 'SuperInput', 'BasicUpload'].includes(name)
  )
    return 'component';
  if (
    name[0] === name[0].toUpperCase() &&
    !name.includes('_') &&
    ![
      'Extensions',
      'Plugin',
      'PluginKey',
      'Decoration',
      'DecorationSet',
      'TrackChangesBasePluginKey',
      'CommentsPluginKey',
    ].includes(name)
  ) {
    return 'extension';
  }

  return 'other';
}

/**
 * Check if an export is documented
 */
function isDocumented(name: string, documented: Set<string>): boolean {
  const lowerName = name.toLowerCase();

  if (documented.has(lowerName)) return true;

  const withoutSuffix = lowerName.replace(/(extension|plugin|mark|node)$/, '');
  if (documented.has(withoutSuffix)) return true;

  const kebab = lowerName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  if (documented.has(kebab)) return true;

  return false;
}

/**
 * Main scanner function
 */
function scanCoverage(): CoverageReport {
  const documented = getDocumentedExports();

  const entryPoints = [join(SUPER_EDITOR_SRC, 'index.js'), join(SUPER_EDITOR_SRC, 'extensions/index.js')];

  const allExports: ExportInfo[] = [];

  for (const entryPoint of entryPoints) {
    if (!existsSync(entryPoint)) {
      console.warn(`Entry point not found: ${entryPoint}`);
      continue;
    }

    const exports = parseExports(entryPoint);
    for (const { name, isInternal } of exports) {
      if (name.startsWith('_') || name === 'default') continue;

      const type = categorizeExport(name);
      const hasDoc = isDocumented(name, documented);

      if (!allExports.find((e) => e.name === name)) {
        allExports.push({
          name,
          source: basename(entryPoint),
          type,
          hasDoc,
          isInternal,
        });
      }
    }
  }

  const internalCount = allExports.filter((e) => e.isInternal).length;
  const publicExports = allExports.filter((e) => !e.isInternal);
  const documentedCount = publicExports.filter((e) => e.hasDoc).length;
  const publicTotal = publicExports.length;

  return {
    total: allExports.length,
    internal: internalCount,
    public: publicTotal,
    documented: documentedCount,
    undocumented: publicTotal - documentedCount,
    percentage: publicTotal > 0 ? Math.round((documentedCount / publicTotal) * 100) : 0,
    exports: allExports,
  };
}

/**
 * Print coverage report
 */
function printReport(report: CoverageReport) {
  console.log('\n========================================');
  console.log('  SuperDoc Documentation Coverage');
  console.log('========================================\n');

  console.log(`Total exports:       ${report.total}`);
  console.log(`Internal (@internal): ${report.internal}`);
  console.log(`Public exports:      ${report.public}`);
  console.log(`Documented:          ${report.documented} (${report.percentage}%)`);
  console.log(`Undocumented:        ${report.undocumented} (${100 - report.percentage}%)\n`);

  // Show internal exports
  const internal = report.exports.filter((e) => e.isInternal);
  if (internal.length > 0) {
    console.log('--- Internal Exports (excluded from coverage) ---\n');
    for (const exp of internal) {
      console.log(`  @internal ${exp.name} (${exp.type})`);
    }
    console.log('');
  }

  // Group public by type
  const publicExports = report.exports.filter((e) => !e.isInternal);
  const byType = new Map<string, ExportInfo[]>();
  for (const exp of publicExports) {
    const list = byType.get(exp.type) || [];
    list.push(exp);
    byType.set(exp.type, list);
  }

  console.log('--- Public Coverage by Type ---\n');
  for (const [type, exports] of byType) {
    const documented = exports.filter((e) => e.hasDoc).length;
    const pct = Math.round((documented / exports.length) * 100);
    console.log(`${type.padEnd(12)} ${documented}/${exports.length} (${pct}%)`);
  }

  console.log('\n--- Undocumented Public Exports ---\n');
  for (const [type, exports] of byType) {
    const undoc = exports.filter((e) => !e.hasDoc);
    if (undoc.length === 0) continue;

    console.log(`[${type}]`);
    for (const exp of undoc) {
      console.log(`  - ${exp.name}`);
    }
    console.log('');
  }

  console.log('--- Documented Public Exports ---\n');
  const doc = publicExports.filter((e) => e.hasDoc);
  for (const exp of doc.slice(0, 20)) {
    console.log(`  ✓ ${exp.name} (${exp.type})`);
  }
  if (doc.length > 20) {
    console.log(`  ... and ${doc.length - 20} more\n`);
  }

  console.log('\n========================================');
  console.log('  Gap Assessment');
  console.log('========================================\n');

  if (report.percentage >= 80) {
    console.log('✅ Coverage is GOOD (≥80%).');
  } else if (report.percentage >= 50) {
    console.log('⚠️  Coverage is MODERATE (50-80%). Consider prioritizing core APIs first.');
  } else {
    console.log('❌ Coverage is LOW (<50%). Consider grandfathering existing + progressive rollout.');
  }
  console.log('');
}

// Run
const report = scanCoverage();
printReport(report);
