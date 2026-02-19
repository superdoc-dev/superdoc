import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, getDocumentText, listTrackChanges } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/tracked-changes.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('tracked change replacement in existing document', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  const textBefore = await getDocumentText(superdoc.page);
  expect(textBefore.length).toBeGreaterThan(0);

  // Grab the first line's text before replacing
  const firstLineText = await superdoc.page.locator('.superdoc-line').first().textContent();
  expect(firstLineText).toBeTruthy();

  // Switch to suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();
  await superdoc.assertDocumentMode('suggesting');

  // Select the first line and type a replacement
  await superdoc.tripleClickLine(0);
  await superdoc.waitForStable();

  await superdoc.type('programmatically inserted');
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toContain('programmatically inserted');
  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'delete' })).total)
    .toBeGreaterThanOrEqual(1);

  // The floating comment dialog for our change should appear with tracked change details.
  // Scope to .floating-comment > .comments-dialog to skip the measurement-layer duplicate.
  const dialog = superdoc.page.locator('.floating-comment > .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text', { hasText: 'programmatically inserted' }),
  });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // It should show the "Added:" label with the new content
  await expect(dialog.locator('.change-type', { hasText: 'Added' }).first()).toBeVisible();
  await expect(dialog.locator('.tracked-change-text', { hasText: 'programmatically inserted' })).toBeVisible();

  // It should show the "Deleted:" label with the original content
  await expect(dialog.locator('.change-type', { hasText: 'Deleted' }).first()).toBeVisible();

  await superdoc.snapshot('tracked change replacement in existing doc');
});
