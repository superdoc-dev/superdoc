import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';
import { activateCommentDialog } from '../../helpers/comments.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('SD-2049 last TC bubble disappears when using custom accept handler', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Type two words on separate lines so we get two independent tracked changes
  await superdoc.type('first');
  await superdoc.newLine();
  await superdoc.type('second');
  await superdoc.waitForStable();

  // Switch to suggesting mode
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Create tracked change on "first" — select and replace
  const pos1 = await superdoc.findTextPos('first');
  await superdoc.setTextSelection(pos1, pos1 + 'first'.length);
  await superdoc.waitForStable();
  await superdoc.type('alpha');
  await superdoc.waitForStable();

  // Create tracked change on "second" — select and replace
  const pos2 = await superdoc.findTextPos('second');
  await superdoc.setTextSelection(pos2, pos2 + 'second'.length);
  await superdoc.waitForStable();
  await superdoc.type('beta');
  await superdoc.waitForStable();

  // Wait for both tracked changes to be registered
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(2);

  // Inject custom accept handler — this is the SD-2049 scenario
  await superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    sd.config.onTrackedChangeBubbleAccept = (comment: any, editor: any) => {
      editor.commands.acceptTrackedChangeById(comment.commentId);
    };
  });

  // Accept tracked changes one by one via bubble UI
  const dialog1 = await activateCommentDialog(superdoc, 'alpha');
  await expect(dialog1).toBeVisible({ timeout: 5_000 });

  // Click the accept button — use force because the overflow-menu icon
  // sits inside the comment-header and Playwright sees the header as intercepting
  await dialog1.locator('.overflow-menu .overflow-menu__icon').first().click({ force: true });
  await superdoc.waitForStable();
  await superdoc.page.waitForTimeout(500);

  // Now handle the second (last) tracked change — this is where SD-2049 would fail
  const remainingTCs = await listTrackChanges(superdoc.page);

  if (remainingTCs.total > 0) {
    const dialog2 = await activateCommentDialog(superdoc, 'beta');
    await expect(dialog2).toBeVisible({ timeout: 5_000 });

    // Accept the last bubble
    await dialog2.locator('.overflow-menu .overflow-menu__icon').first().click({ force: true });
    await superdoc.waitForStable();
  }

  // The key assertion: no unresolved floating comment dialogs should remain.
  // Before the SD-2049 fix, the last bubble would persist as a ghost.
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog:not(.is-resolved)')).toHaveCount(0, {
    timeout: 5_000,
  });

  await superdoc.snapshot('sd-2049-no-ghost-bubbles');
});

test('SD-2049 last TC bubble disappears when using custom reject handler', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('hello world');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Create a single tracked change
  const pos = await superdoc.findTextPos('hello');
  await superdoc.setTextSelection(pos, pos + 'hello'.length);
  await superdoc.waitForStable();
  await superdoc.type('goodbye');
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);

  // Inject custom reject handler
  await superdoc.page.evaluate(() => {
    const sd = (window as any).superdoc;
    sd.config.onTrackedChangeBubbleReject = (comment: any, editor: any) => {
      editor.commands.rejectTrackedChangeById(comment.commentId);
    };
  });

  // Activate the TC bubble and click reject (second icon in overflow menu)
  const dialog = await activateCommentDialog(superdoc, 'goodbye');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.locator('.overflow-menu .overflow-menu__icon').nth(1).click({ force: true });
  await superdoc.waitForStable();

  // No ghost bubbles should remain
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog:not(.is-resolved)')).toHaveCount(0, {
    timeout: 5_000,
  });

  // Text should be reverted since we rejected
  await superdoc.assertTextContains('hello');

  await superdoc.snapshot('sd-2049-reject-no-ghost-bubble');
});
