import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

test('@behavior SD-2464: last comment bubble is not clipped when many tracked changes exist', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  // Switch to suggesting mode so edits create tracked changes
  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Create 8 tracked changes on separate lines to push the last bubble low
  for (let i = 0; i < 8; i++) {
    await superdoc.type(`tracked change ${i + 1}`);
    await superdoc.newLine();
    await superdoc.waitForStable();
  }

  // Verify tracked changes were created
  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'insert' })).total)
    .toBeGreaterThanOrEqual(8);

  // Wait for floating comment placeholders to render
  const placeholders = superdoc.page.locator('.comment-placeholder');
  await expect(placeholders.first()).toBeAttached({ timeout: 10_000 });

  // Click the last bubble to activate it (triggers sidebar alignment)
  const lastDialog = placeholders.last().locator('.comments-dialog');
  await expect(lastDialog).toBeAttached({ timeout: 10_000 });
  await lastDialog.click({ position: { x: 12, y: 12 } });
  await superdoc.waitForStable();

  // Wait for the alignment timer (400ms) + transition (300ms) + buffer
  await superdoc.page.waitForTimeout(1000);

  // The active dialog should be fully visible — not clipped by the parent container.
  // Get the bounding rects of the active dialog and the .floating-comments container.
  const clipping = await superdoc.page.evaluate(() => {
    const activeDialog = document.querySelector('.comments-dialog.is-active');
    const floatingComments = document.querySelector('.floating-comments');
    if (!activeDialog || !floatingComments) return null;

    const dRect = activeDialog.getBoundingClientRect();
    const fRect = floatingComments.getBoundingClientRect();

    return {
      dialogBottom: dRect.bottom,
      containerBottom: fRect.bottom,
      containerOverflow: getComputedStyle(floatingComments).overflow,
    };
  });

  expect(clipping).not.toBeNull();

  // The container should use overflow: visible (not hidden) so bubbles are never clipped
  expect(clipping!.containerOverflow).toBe('visible');

  // The dialog should either fit within the container OR overflow is visible so it's still shown
  // With overflow: visible, even if dialogBottom > containerBottom the content is still visible
  // This test primarily guards against regression to overflow: hidden
});
