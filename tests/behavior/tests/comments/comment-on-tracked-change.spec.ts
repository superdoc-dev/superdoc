import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments, listTrackChanges } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/gdocs-comment-on-change.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('comment thread on tracked change shows both the change and replies', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total).toBe(4);

  // Both "new text" and "Test" should have comment highlights
  await superdoc.assertCommentHighlightExists({ text: 'new text' });
  await superdoc.assertCommentHighlightExists({ text: 'Test' });

  // Click on the "new text" comment highlight to activate its dialog
  await superdoc.clickOnCommentedText('new text');
  await superdoc.waitForStable();

  // Find the dialog that contains "new text" tracked change info
  const dialog = superdoc.page.locator('.floating-comment > .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text', { hasText: 'new text' }),
  });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // The tracked change should show "Added:" and "Deleted:" labels
  await expect(dialog.locator('.change-type', { hasText: 'Added' }).first()).toBeVisible();
  await expect(dialog.locator('.tracked-change-text', { hasText: 'new text' })).toBeVisible();
  await expect(dialog.locator('.change-type', { hasText: 'Deleted' }).first()).toBeVisible();

  // The threaded comment replies should be visible below the tracked change
  const commentBodies = dialog.locator('.comment-body .comment');
  await expect(commentBodies).toHaveCount(2);
  await expect(commentBodies.nth(0)).toContainText('reply to tracked change');
  await expect(commentBodies.nth(1)).toContainText('reply to reply');

  await superdoc.snapshot('comment thread on tracked change');
});

test('clicking a different comment activates its dialog', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
  await superdoc.waitForStable();
  await assertDocumentApiReady(superdoc.page);

  // Click on the "Test" comment highlight
  await superdoc.clickOnCommentedText('Test');
  await superdoc.waitForStable();

  // The active dialog should switch to the clicked "Test" thread
  const activeDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
  await expect(activeDialog).toBeVisible({ timeout: 5_000 });
  const activeComments = activeDialog.locator('.comment-body .comment');
  await expect(activeComments).toHaveCount(2);
  await expect(activeComments.nth(0)).toContainText('abc');
  await expect(activeComments.nth(1)).toContainText('xyz');

  // Click away to deselect
  await superdoc.clickOnLine(4);
  await superdoc.waitForStable();
  await expect(superdoc.page.locator('.floating-comment > .comments-dialog.is-active')).toHaveCount(0);

  await superdoc.snapshot('comment deselected after clicking away');
});
