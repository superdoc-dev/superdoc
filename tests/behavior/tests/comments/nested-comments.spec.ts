import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listComments } from '../../helpers/document-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GDOCS_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/nested-comments-gdocs.docx');
const WORD_PATH = path.resolve(__dirname, '../../test-data/comments-tcs/nested-comments-word.docx');

test.use({ config: { toolbar: 'full', comments: 'panel' } });

// ---------------------------------------------------------------------------
// Google Docs nested/overlapping comments
// ---------------------------------------------------------------------------

test.describe('nested comments from Google Docs', () => {
  test.skip(!fs.existsSync(GDOCS_PATH), 'Test document not available — run pnpm corpus:pull');

  test('overlapping comment highlights exist and dialogs activate on click', async ({ superdoc }) => {
    await superdoc.loadDocument(GDOCS_PATH);
    await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
    await superdoc.waitForStable();
    await assertDocumentApiReady(superdoc.page);

    // Multiple comment highlights should be present
    const highlights = superdoc.page.locator('.superdoc-comment-highlight');
    const count = await highlights.count();
    expect(count).toBe(7);
    await expect.poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total).toBe(5);

    // Click "Licensee" — dialog shows "licensee...distribute" + "modify" replies
    await superdoc.clickOnCommentedText('Licensee');
    await superdoc.waitForStable();

    const licenseeDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(licenseeDialog).toBeVisible({ timeout: 5_000 });
    const licenseeComments = licenseeDialog.locator('.comment-body .comment');
    await expect(licenseeComments).toHaveCount(2);
    await expect(licenseeComments.nth(0)).toContainText('licensee');
    await expect(licenseeComments.nth(1)).toContainText('modify');

    // Click "proprietary" — different comment activates
    await superdoc.clickOnCommentedText('proprietary');
    await superdoc.waitForStable();

    const proprietaryDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(proprietaryDialog).toBeVisible({ timeout: 5_000 });
    await expect(proprietaryDialog.locator('.comment-body .comment').first()).toContainText('proprietary notices');

    // Click "labels" — shows comment with reply
    await superdoc.clickOnCommentedText('labels');
    await superdoc.waitForStable();

    const labelsDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(labelsDialog).toBeVisible({ timeout: 5_000 });
    const labelsComments = labelsDialog.locator('.comment-body .comment');
    await expect(labelsComments).toHaveCount(2);
    await expect(labelsComments.nth(0)).toContainText('notices or labels');
    await expect(labelsComments.nth(1)).toContainText('with reply');

    // Click away to deselect — no active dialog
    await superdoc.clickOnLine(1, 50);
    await superdoc.waitForStable();
    await expect(superdoc.page.locator('.floating-comment > .comments-dialog.is-active')).toHaveCount(0);

    await superdoc.snapshot('nested-comments-gdocs');
  });
});

// ---------------------------------------------------------------------------
// MS Word nested/overlapping comments
// ---------------------------------------------------------------------------

test.describe('nested comments from MS Word', () => {
  test.skip(!fs.existsSync(WORD_PATH), 'Test document not available — run pnpm corpus:pull');

  test('overlapping comment highlights exist and dialogs activate on click', async ({ superdoc }) => {
    await superdoc.loadDocument(WORD_PATH);
    await superdoc.page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
    await superdoc.waitForStable();
    await assertDocumentApiReady(superdoc.page);

    // Multiple comment highlights should be present
    const highlights = superdoc.page.locator('.superdoc-comment-highlight');
    const count = await highlights.count();
    expect(count).toBe(7);
    await expect.poll(async () => (await listComments(superdoc.page, { includeResolved: true })).total).toBe(5);

    // Click "modify" — dialog shows "comment on modify"
    await superdoc.clickOnCommentedText('modify');
    await superdoc.waitForStable();

    const modifyDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(modifyDialog).toBeVisible({ timeout: 5_000 });
    await expect(modifyDialog.locator('.comment-body .comment').first()).toContainText('comment on modify');

    // Click "Licensee" — different, broader comment activates
    await superdoc.clickOnCommentedText('Licensee');
    await superdoc.waitForStable();

    const licenseeDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(licenseeDialog).toBeVisible({ timeout: 5_000 });
    await expect(licenseeDialog.locator('.comment-body .comment').first()).toContainText(
      'comment from licensee to distribute',
    );

    // Click "proprietary" — shows "proprietary notices"
    await superdoc.clickOnCommentedText('proprietary');
    await superdoc.waitForStable();

    const proprietaryDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(proprietaryDialog).toBeVisible({ timeout: 5_000 });
    await expect(proprietaryDialog.locator('.comment-body .comment').first()).toContainText('proprietary notices');

    // Click "labels" — comment with reply thread
    await superdoc.clickOnCommentedText('labels');
    await superdoc.waitForStable();

    const labelsDialog = superdoc.page.locator('.floating-comment > .comments-dialog.is-active').last();
    await expect(labelsDialog).toBeVisible({ timeout: 5_000 });
    const labelsComments = labelsDialog.locator('.comment-body .comment');
    await expect(labelsComments).toHaveCount(2);
    await expect(labelsComments.nth(0)).toContainText('notices or labels');
    await expect(labelsComments.nth(1)).toContainText('with reply');

    // Click away to deselect — no active dialog
    await superdoc.clickOnLine(1, 50);
    await superdoc.waitForStable();
    await expect(superdoc.page.locator('.floating-comment > .comments-dialog.is-active')).toHaveCount(0);

    await superdoc.snapshot('nested-comments-word');
  });
});
