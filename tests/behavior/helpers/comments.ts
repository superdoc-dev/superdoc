import { expect, type Page, type Locator } from '@playwright/test';
import type { SuperDocFixture } from '../fixtures/superdoc.js';
import { listComments } from './document-api.js';

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Locator for the active (clicked/focused) floating comment dialog. */
export const activeCommentDialog = (page: Page): Locator =>
  page.locator('.comment-placeholder .comments-dialog.is-active').last();

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
