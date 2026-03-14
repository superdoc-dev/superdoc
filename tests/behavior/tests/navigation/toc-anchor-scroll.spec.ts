import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/layout/toc-with-heading2.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('@behavior SD-2186: clicking TOC link scrolls to heading position', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  // Record selection before click
  const selBefore = await superdoc.getSelection();

  // Find and click the first TOC entry link
  const tocLink = superdoc.page.locator('.superdoc-toc-entry a.superdoc-link').first();
  await expect(tocLink).toBeVisible({ timeout: 10_000 });
  await tocLink.click();
  await superdoc.waitForStable(2000);

  // Verify the caret moved — goToAnchor calls setTextSelection at the bookmark position
  const selAfter = await superdoc.getSelection();
  expect(selAfter.from).not.toBe(selBefore.from);
});

test('@behavior SD-2186: clicking different TOC links moves caret to different positions', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  // Need at least 2 TOC entries to verify they navigate to different positions
  const tocLinks = superdoc.page.locator('.superdoc-toc-entry a.superdoc-link');
  const count = await tocLinks.count();
  test.skip(count < 2, 'Document has fewer than 2 TOC entries');

  // Click first TOC link and record caret position
  const firstLink = tocLinks.first();
  await expect(firstLink).toBeVisible({ timeout: 10_000 });
  await firstLink.click();
  await superdoc.waitForStable(2000);
  const selFirst = await superdoc.getSelection();

  // Click last TOC link and verify caret moved to a different position
  const lastLink = tocLinks.nth(count - 1);
  await expect(lastLink).toBeVisible({ timeout: 10_000 });
  await lastLink.click();
  await superdoc.waitForStable(2000);
  const selLast = await superdoc.getSelection();

  expect(selLast.from).not.toBe(selFirst.from);
});
