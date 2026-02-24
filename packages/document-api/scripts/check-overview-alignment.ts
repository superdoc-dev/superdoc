/**
 * Purpose: Enforce required/forbidden overview content and API-surface path validity.
 * Caller: Documentation consistency gate for `apps/docs/document-api/overview.mdx`.
 * Reads: Overview doc content + `DOCUMENT_API_MEMBER_PATHS`.
 * Writes: None (exit code + console output only).
 * Fails when: Disclaimers/markers are missing, forbidden placeholders exist, or unknown API paths appear.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DOCUMENT_API_MEMBER_PATHS } from '../src/index.js';
import { runScript } from './lib/generation-utils.js';
import {
  getOverviewApiSurfaceEndMarker,
  getOverviewApiSurfaceStartMarker,
  getOverviewDocsPath,
} from './lib/reference-docs-artifacts.js';

const OVERVIEW_PATH = resolve(process.cwd(), getOverviewDocsPath());

const REQUIRED_PATTERNS = [
  {
    label: 'alpha disclaimer',
    pattern: /\balpha\b/i,
  },
  {
    label: 'subject-to-change disclaimer',
    pattern: /subject to (?:breaking )?changes?/i,
  },
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
    label: 'legacy placeholder query API',
    pattern: /\bdoc\.query\s*\(/,
  },
  {
    label: 'legacy placeholder table API',
    pattern: /\bdoc\.table\s*\(/,
  },
  {
    label: 'legacy field-annotation selector example',
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

  const knownMemberPaths = new Set(DOCUMENT_API_MEMBER_PATHS);
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
