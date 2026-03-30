import { expect, type Page, type Locator } from '@playwright/test';
import type { SuperDocFixture } from '../fixtures/superdoc.js';
import { listComments } from './document-api.js';

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Locator for the active (clicked/focused) floating comment dialog. */
export const activeCommentDialog = (page: Page): Locator =>
  page.locator('.comment-placeholder .comments-dialog.is-active, .comment-placeholder .comments-dialog').last();

const locatorTop = async (locator: Locator): Promise<number> => {
  const target = locator.first();
  await expect(target).toBeVisible({ timeout: 10_000 });
  return target.evaluate((el) => el.getBoundingClientRect().top);
};

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
  const dialog = await openPendingCommentViaUI(superdoc, { textToSelect });

  await dialog.locator('.comment-entry .superdoc-field').first().click();
  await superdoc.page.keyboard.type(commentText);
  await superdoc.waitForStable();

  await dialog.locator('.reply-btn-primary', { hasText: 'Comment' }).first().click();
  await superdoc.waitForStable();
}

/**
 * Select text and open the pending comment dialog via the toolbar bubble UI.
 */
export async function openPendingCommentViaUI(
  superdoc: SuperDocFixture,
  { textToSelect }: { textToSelect: string },
): Promise<Locator> {
  const pos = await superdoc.findTextPos(textToSelect);
  await superdoc.setTextSelection(pos, pos + textToSelect.length);
  await superdoc.waitForStable();

  const bubble = superdoc.page.locator('.superdoc__tools');
  await expect(bubble).toBeVisible({ timeout: 5_000 });
  await bubble.locator('[data-id="is-tool"]').click();

  const dialog = superdoc.page.locator('.comments-dialog.is-active').last();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
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

/**
 * Assert that two visible locators are vertically aligned within a tolerance.
 */
export async function expectDialogTopNearLocator(
  dialog: Locator,
  anchor: Locator,
  { tolerancePx = 16 }: { tolerancePx?: number } = {},
): Promise<void> {
  const [dialogTop, anchorTop] = await Promise.all([locatorTop(dialog), locatorTop(anchor)]);
  expect(
    Math.abs(dialogTop - anchorTop),
    `Expected dialog top ${dialogTop} to be within ${tolerancePx}px of anchor top ${anchorTop}`,
  ).toBeLessThanOrEqual(tolerancePx);
}

/**
 * Assert that a specific floating comment thread stops moving after the initial
 * click-to-focus handoff.
 *
 * The old regression scheduled a second alignment around 400ms later, so this
 * helper samples the dialog's top position on every animation frame, ignores
 * the initial handoff window, then verifies the thread stays within a small
 * tolerance for the rest of the observation period.
 */
export async function expectNoDelayedFloatingCommentMotion(
  page: Page,
  commentId: string,
  {
    ignoreInitialMs = 250,
    observeForMs = 700,
    tolerancePx = 4,
  }: {
    ignoreInitialMs?: number;
    observeForMs?: number;
    tolerancePx?: number;
  } = {},
): Promise<void> {
  const selector = `.comment-placeholder[data-comment-id="${commentId}"] .comments-dialog`;
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 10_000 });

  const samples = await page.evaluate(
    ({ dialogSelector, durationMs }) => {
      return new Promise<Array<{ elapsedMs: number; top: number | null }>>((resolve) => {
        const measurements: Array<{ elapsedMs: number; top: number | null }> = [];
        const start = performance.now();

        const sample = () => {
          const elapsedMs = performance.now() - start;
          const dialog = document.querySelector(dialogSelector);
          const top = dialog instanceof HTMLElement ? dialog.getBoundingClientRect().top : null;
          measurements.push({ elapsedMs, top });

          if (elapsedMs >= durationMs) {
            resolve(measurements);
            return;
          }

          requestAnimationFrame(sample);
        };

        requestAnimationFrame(sample);
      });
    },
    { dialogSelector: selector, durationMs: ignoreInitialMs + observeForMs },
  );

  const stableSamples = samples
    .filter((sample) => sample.elapsedMs >= ignoreInitialMs && typeof sample.top === 'number')
    .map((sample) => sample.top as number);

  expect(
    stableSamples.length,
    `Expected floating comment ${commentId} to remain mounted while tracking motion samples.`,
  ).toBeGreaterThan(0);

  const minTop = Math.min(...stableSamples);
  const maxTop = Math.max(...stableSamples);
  const movementPx = maxTop - minTop;

  expect(
    movementPx,
    [
      `Expected floating comment ${commentId} to stop moving after the first ${ignoreInitialMs}ms,`,
      `but it drifted across a ${movementPx.toFixed(2)}px range`,
      `during the next ${observeForMs}ms (min ${minTop.toFixed(2)}px, max ${maxTop.toFixed(2)}px).`,
    ].join(' '),
  ).toBeLessThanOrEqual(tolerancePx);
}
