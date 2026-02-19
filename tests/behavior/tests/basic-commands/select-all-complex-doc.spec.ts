import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/basic/advanced-tables.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', showSelection: true } });

test('select all captures entire document in a complex table doc', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Re-focus the editor after loading a new document
  await superdoc.clickOnLine(0);
  await superdoc.waitForStable();

  // Use document-api text length as a stable baseline for full-document selection.
  const docText = await superdoc.getTextContent();
  expect(docText.length).toBeGreaterThan(0);

  // Use the editor command for select-all (keyboard shortcut produces AllSelection
  // which reports from=0, to=docSize; the command gives a reliable TextSelection).
  await superdoc.executeCommand('selectAll');
  await superdoc.waitForStable();

  // Selection should span the entire document content
  const selection = await superdoc.getSelection();
  expect(selection.to - selection.from).toBeGreaterThan(0);
  expect(selection.from).toBeLessThanOrEqual(1);
  expect(selection.to - selection.from).toBeGreaterThanOrEqual(docText.length);
});
