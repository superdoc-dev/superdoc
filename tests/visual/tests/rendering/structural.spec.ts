import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, '../../test-data/rendering');

// ---------------------------------------------------------------------------
// Structural tests — lightweight assertions (page counts, text presence)
// that catch real regressions without pixel comparison flakiness.
// These run as a hard gate in CI; pixel-diff tests run separately as review.
// ---------------------------------------------------------------------------

test('@structural advanced-text renders 3 pages', async ({ superdoc }) => {
  const docPath = path.join(DOCS_DIR, 'advanced-text.docx');
  expect(fs.existsSync(docPath), `Required test document missing: ${docPath}`).toBe(true);
  await superdoc.loadDocument(docPath);
  await superdoc.assertPageCount(3);
});

test('@structural advanced-tables renders 2 pages', async ({ superdoc }) => {
  const docPath = path.join(DOCS_DIR, 'advanced-tables.docx');
  expect(fs.existsSync(docPath), `Required test document missing: ${docPath}`).toBe(true);
  await superdoc.loadDocument(docPath);
  await superdoc.assertPageCount(2);
});
