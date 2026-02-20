import { access } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');

const SOURCE_DOC_CANDIDATES = [
  path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/advanced-text.docx'),
  path.join(REPO_ROOT, 'e2e-tests/test-data/basic-documents/advanced-text.docx'),
];

const LIST_SOURCE_DOC_CANDIDATES = [
  path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/basic-list.docx'),
  path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/list_with_indents.docx'),
  path.join(REPO_ROOT, 'devtools/document-api-tests/fixtures/matrix-list.input.docx'),
  path.join(REPO_ROOT, 'e2e-tests/test-data/basic-documents/lists-complex-items.docx'),
];

let resolvedSourceDoc: string | null = null;
let resolvedListSourceDoc: string | null = null;

async function resolveFixture(candidates: string[], fixtureLabel: string): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`No ${fixtureLabel} fixture found. Tried: ${candidates.join(', ')}`);
}

export async function resolveSourceDocFixture(): Promise<string> {
  if (resolvedSourceDoc != null) return resolvedSourceDoc;
  resolvedSourceDoc = await resolveFixture(SOURCE_DOC_CANDIDATES, 'source document');
  return resolvedSourceDoc;
}

export async function resolveListDocFixture(): Promise<string> {
  if (resolvedListSourceDoc != null) return resolvedListSourceDoc;
  resolvedListSourceDoc = await resolveFixture(LIST_SOURCE_DOC_CANDIDATES, 'list');
  return resolvedListSourceDoc;
}
