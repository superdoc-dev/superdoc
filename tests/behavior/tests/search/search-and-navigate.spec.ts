import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/longer-header.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('search and navigate to results in document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Search for text that spans across content
  const query = 'works of the Licensed Material';
  const matches = await superdoc.page.evaluate((q: string) => {
    return (window as any).editor?.commands?.search?.(q) ?? [];
  }, query);

  expect(matches.length).toBeGreaterThan(0);

  // Navigate to first result — selection should move
  const selBefore = await superdoc.getSelection();

  await superdoc.page.evaluate((match: any) => {
    (window as any).editor.commands.goToSearchResult(match);
  }, matches[0]);
  await superdoc.waitForStable();

  const selAfter = await superdoc.getSelection();
  // Selection should have changed (cursor moved to the search result)
  expect(selAfter.from).not.toBe(selBefore.from);

  // The selected range should span the search query length
  expect(selAfter.to - selAfter.from).toBe(query.length);

  // Verify the text at the selection matches the query
  await superdoc.assertTextContains(query);

  // Test a second search query
  const query2 = 'Agreement';
  const matches2 = await superdoc.page.evaluate((q: string) => {
    return (window as any).editor?.commands?.search?.(q) ?? [];
  }, query2);

  expect(matches2.length).toBeGreaterThan(0);

  await superdoc.page.evaluate((match: any) => {
    (window as any).editor.commands.goToSearchResult(match);
  }, matches2[0]);
  await superdoc.waitForStable();

  const selAfter2 = await superdoc.getSelection();
  expect(selAfter2.to - selAfter2.from).toBe(query2.length);

  await superdoc.snapshot('search-and-navigate');
});
