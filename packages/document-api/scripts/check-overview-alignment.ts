/**
 * Purpose: Enforce structural correctness of the Document API overview page.
 * Caller: Documentation consistency gate for `apps/docs/document-api/available-operations.mdx`.
 * Reads: Overview doc content + `DOCUMENT_API_MEMBER_PATHS`.
 * Writes: None (exit code + console output only).
 * Fails when: The reference link or generated section markers are missing,
 *   forbidden stale placeholders appear, or `editor.doc.*` paths reference
 *   unknown API members.
 *
 * NOT enforced: product-status framing (e.g. "alpha", "subject to change").
 * Those launch-phase disclaimers were removed when the Document API went
 * live; this gate now focuses on durable structural correctness.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DOCUMENT_API_MEMBER_PATHS, REFERENCE_OPERATION_ALIASES } from '../src/index.js';
import { runScript } from './lib/generation-utils.js';
import {
  getOverviewApiSurfaceEndMarker,
  getOverviewApiSurfaceStartMarker,
  getOverviewDocsPath,
} from './lib/reference-docs-artifacts.js';

const OVERVIEW_PATH = resolve(process.cwd(), getOverviewDocsPath());

const REQUIRED_PATTERNS = [
  {
    label: 'generated reference link',
    pattern: /\/document-api\/reference\/index/i,
  },
  {
    label: 'generated API surface start marker',
    pattern: new RegExp(getOverviewApiSurfaceStartMarker().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  },
  {
    label: 'generated API surface end marker',
    pattern: new RegExp(getOverviewApiSurfaceEndMarker().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  },
] as const;

const FORBIDDEN_PATTERNS = [
  {
    label: 'removed placeholder query API',
    pattern: /\bdoc\.query\s*\(/,
  },
  {
    label: 'removed placeholder table API',
    pattern: /\bdoc\.table\s*\(/,
  },
  {
    label: 'removed field-annotation selector example',
    pattern: /field-annotation/i,
  },
  {
    label: 'coming-soon placeholder copy',
    pattern: /coming soon/i,
  },
] as const;

const MEMBER_PATH_REGEX = /\beditor\.doc\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g;

function extractOverviewMemberPaths(content: string): string[] {
  const paths = new Set<string>();
  for (const match of content.matchAll(MEMBER_PATH_REGEX)) {
    const path = match[1];
    if (!path) continue;
    paths.add(path);
  }
  return [...paths].sort();
}

runScript('document-api overview alignment check', async () => {
  const content = await readFile(OVERVIEW_PATH, 'utf8');
  const errors: string[] = [];

  for (const requirement of REQUIRED_PATTERNS) {
    if (!requirement.pattern.test(content)) {
      errors.push(`missing ${requirement.label}`);
    }
  }

  for (const forbidden of FORBIDDEN_PATTERNS) {
    if (forbidden.pattern.test(content)) {
      errors.push(`contains ${forbidden.label}`);
    }
  }

  const knownMemberPaths = new Set([
    ...DOCUMENT_API_MEMBER_PATHS,
    ...REFERENCE_OPERATION_ALIASES.map((a) => a.memberPath),
  ]);
  const overviewMemberPaths = extractOverviewMemberPaths(content);

  const unknownPaths = overviewMemberPaths.filter((path) => !knownMemberPaths.has(path));
  if (unknownPaths.length > 0) {
    errors.push(`overview includes unknown Document API paths: ${unknownPaths.join(', ')}`);
  }

  if (errors.length > 0) {
    console.error('document-api overview alignment check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`document-api overview alignment check passed (${overviewMemberPaths.length} member paths referenced).`);
});
