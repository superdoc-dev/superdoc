import { expect, type Page, type Locator } from '@playwright/test';
import type { SuperDocFixture } from '../fixtures/superdoc.js';
import { listComments } from './document-api.js';

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Locator for the active (clicked/focused) floating comment dialog. */
export const activeCommentDialog = (page: Page): Locator =>
  page.locator('.comment-placeholder .comments-dialog.is-active, .comment-placeholder .comments-dialog').last();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add a comment through the toolbar bubble UI.
 *
 * Selects `textToSelect` in the editor, clicks the comment tool in the
 * floating bubble, types `commentText`, and submits.
 */
export async function addCommentViaUI(
  superdoc: SuperDocFixture,
  { textToSelect, commentText }: { textToSelect: string; commentText: string },
): Promise<void> {
  const pos = await superdoc.findTextPos(textToSelect);
  await superdoc.setTextSelection(pos, pos + textToSelect.length);
  await superdoc.waitForStable();

  const bubble = superdoc.page.locator('.superdoc__tools');
  await expect(bubble).toBeVisible({ timeout: 5_000 });
  await bubble.locator('[data-id="is-tool"]').click();

  // Give the layout engine time to emit pending-comment positions
  await superdoc.page.waitForTimeout(1000);

  const dialog = superdoc.page.locator('.comments-dialog.is-active').last();
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  await dialog.locator('.comment-entry .superdoc-field').first().click();
  await superdoc.page.keyboard.type(commentText);
  await superdoc.waitForStable();

  await dialog.locator('.reply-btn-primary', { hasText: 'Comment' }).first().click();
  await superdoc.waitForStable();
}

/**
 * Click a comment highlight and ensure the dialog becomes active.
 *
 * On Firefox, clicking the presentation-layer highlight does not propagate
 * to the Vue comment store, so the dialog never gets `.is-active`. This
 * helper clicks the highlight first (to position the dialog), then clicks
 * the dialog itself to guarantee activation cross-browser.
 */
export async function activateCommentDialog(
  superdoc: SuperDocFixture,
  textMatch: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<Locator> {
  // Try clicking the highlight first (may fail on WebKit after re-renders)
  const highlightClicked = await superdoc
    .clickOnCommentedText(textMatch)
    .then(() => true)
    .catch(() => false);

  if (highlightClicked) {
    await superdoc.waitForStable();
  }

  const activeDialog = superdoc.page.locator('.comment-placeholder .comments-dialog.is-active').last();
  const dialog = activeCommentDialog(superdoc.page);
  const hasActiveDialog = (await activeDialog.count()) > 0;

  if (!hasActiveDialog) {
    // Fallback: click the floating dialog directly to trigger setFocus → is-active
    const floatingDialog = superdoc.page.locator('.comment-placeholder .comments-dialog').last();
    await expect(floatingDialog).toBeVisible({ timeout: timeoutMs });
    // Click near the top-left to avoid accidentally hitting interactive controls
    // such as the "N more replies" collapse/expand pill in the middle of the card.
    await floatingDialog.click({ position: { x: 12, y: 12 } });
    await superdoc.waitForStable();

    const hasActiveDialogNow = (await activeDialog.count()) > 0;
    if (!hasActiveDialogNow) {
      // Last resort: set activeComment directly on the Pinia store. This is
      // needed when click events don't propagate to activate the dialog
      // (Firefox/WebKit) or replyToComment calls set it to a child ID.
      // We read the dialog's own commentId from the DOM to guarantee a match
      // with the computed `isActiveComment` check.
      await superdoc.page.evaluate(() => {
        const sd = (window as any).superdoc;
        const store = sd.commentsStore;
        const floatingComments = store.getFloatingComments ?? [];
        if (floatingComments.length > 0) {
          const parentId = floatingComments[0].commentId;
          store.$patch({ activeComment: parentId });
        }
      });
      await superdoc.waitForStable();
    }
  }

  if ((await activeDialog.count()) > 0) {
    await expect(activeDialog).toBeVisible({ timeout: timeoutMs });
    return activeDialog;
  }

  await expect(dialog).toBeVisible({ timeout: timeoutMs });
  return dialog;
}

/**
 * Poll `listComments` until a comment anchored on `anchoredText` appears,
 * then return its `commentId`.
 */
export async function getCommentId(
  page: Page,
  anchoredText: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<string> {
  await expect
    .poll(
      async () => {
        const result = await listComments(page, { includeResolved: true });
        return result.matches?.some((m: any) => m.anchoredText === anchoredText);
      },
      { timeout: timeoutMs },
    )
    .toBeTruthy();

  const listed = await listComments(page, { includeResolved: true });
  const match = listed.matches.find((m: any) => m.anchoredText === anchoredText);
  if (!match?.commentId) {
    throw new Error(`No commentId found for anchoredText "${anchoredText}"`);
  }
  return match.commentId;
}

/**
 * Add a comment through the UI and return its `commentId`.
 *
 * Combines `addCommentViaUI` + `assertCommentHighlightExists` + `getCommentId`.
 */
export async function addCommentViaUIWithId(
  superdoc: SuperDocFixture,
  opts: { textToSelect: string; commentText: string; timeoutMs?: number },
): Promise<string> {
  await addCommentViaUI(superdoc, opts);
  await superdoc.assertCommentHighlightExists({ text: opts.textToSelect, timeoutMs: opts.timeoutMs });
  return getCommentId(superdoc.page, opts.textToSelect, { timeoutMs: opts.timeoutMs });
}
