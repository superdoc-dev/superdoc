import { expect, type Page, type Locator } from '@playwright/test';
import type { SuperDocFixture } from '../fixtures/superdoc.js';

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
