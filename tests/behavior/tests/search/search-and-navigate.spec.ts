import { test, expect } from '../../fixtures/superdoc.js';
import { H_F_NORMAL_DOC_PATH as DOC_PATH } from '../../helpers/story-fixtures.js';

test('search and navigate to results in document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Search for text that spans across content
  const query = 'NetHack';
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
