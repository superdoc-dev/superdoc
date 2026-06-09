import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/layout/toc-with-heading2.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test('@behavior SD-2663: hovering one TOC entry greys out every entry in the same group', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(2000);

  const entries = superdoc.page.locator('.superdoc-toc-entry[data-toc-id]');
  await expect(entries.first()).toBeVisible({ timeout: 10_000 });

  const entryCount = await entries.count();
  test.skip(entryCount < 2, 'Document has fewer than 2 TOC entries; group hover requires at least 2');

  // Pin the first entry's group id and walk forward until we find another
  // entry that shares it. Anything in the same group should highlight together
  // when one is hovered.
  const firstId = await entries.first().getAttribute('data-toc-id');
  expect(firstId).toBeTruthy();
  const groupMembers = superdoc.page.locator(`.superdoc-toc-entry[data-toc-id="${firstId}"]`);
  const groupSize = await groupMembers.count();
  test.skip(groupSize < 2, 'No TOC group has 2+ entries sharing data-toc-id in this fixture');

  await entries.first().hover();
  await superdoc.waitForStable();

  // Every member of the group gets toc-group-hover, regardless of which one
  // the pointer is over. Use evaluateAll so the assertion is per-element.
  const hoveredFlags = await groupMembers.evaluateAll((els) =>
    els.map((el) => el.classList.contains('toc-group-hover')),
  );
  expect(hoveredFlags).toHaveLength(groupSize);
  expect(hoveredFlags.every(Boolean)).toBe(true);

  // Move the pointer well outside the TOC and verify the hover clears across
  // the whole group, not just the entry the pointer was last on.
  await superdoc.page.mouse.move(0, 0);
  await superdoc.waitForStable();

  const clearedFlags = await groupMembers.evaluateAll((els) =>
    els.map((el) => el.classList.contains('toc-group-hover')),
  );
  expect(clearedFlags.every((flag) => flag === false)).toBe(true);
});
