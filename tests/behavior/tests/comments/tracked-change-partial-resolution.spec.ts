import { test, expect } from '../../fixtures/superdoc.js';
import { getDocumentText } from '../../helpers/document-api.js';
import { rightClickAtDocPos } from '../../helpers/editor-interactions.js';
import { getMarkedText, getSelectedText, insertTrackedChange } from '../../helpers/tracked-changes.js';

test.use({ config: { toolbar: 'full', comments: 'panel', trackChanges: true, showSelection: true } });

const TRACK_TEXT = 'ABCDE';
const PARTIAL_TEXT = 'BC';
const ACCEPT_TRACKED_CHANGES_BUTTON = 'Accept tracked changes';

test('toolbar accept partially resolves a tracked insertion and updates the bubble text', async ({ superdoc }) => {
  await insertTrackedChange(superdoc.page, { from: 1, to: 1, text: TRACK_TEXT });
  await superdoc.waitForStable();

  const selectionStart = await superdoc.findTextPos(PARTIAL_TEXT);
  await superdoc.setTextSelection(selectionStart, selectionStart + PARTIAL_TEXT.length);
  await superdoc.waitForStable();

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: TRACK_TEXT }),
  });
  await expect(trackedDialog).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-before-accept');

  await superdoc.page.getByRole('button', { name: ACCEPT_TRACKED_CHANGES_BUTTON }).click();
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toBe(TRACK_TEXT);
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe('ADE');
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text')).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-after-accept');
});

test('context menu reject partially resolves a tracked insertion and updates the bubble text', async ({
  superdoc,
  browserName,
}) => {
  test.skip(browserName === 'firefox', 'Firefox collapses selection on right-click natively');

  await insertTrackedChange(superdoc.page, { from: 1, to: 1, text: TRACK_TEXT });
  await superdoc.waitForStable();

  const selectionStart = await superdoc.findTextPos(PARTIAL_TEXT);
  await superdoc.setTextSelection(selectionStart, selectionStart + PARTIAL_TEXT.length);
  await superdoc.waitForStable();

  await expect.poll(() => getSelectedText(superdoc.page)).toBe(PARTIAL_TEXT);

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: TRACK_TEXT }),
  });
  await expect(trackedDialog).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-before-context-reject');

  await rightClickAtDocPos(superdoc.page, selectionStart + 1);
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  await menu.locator('.context-menu-item').filter({ hasText: 'Reject change' }).click();
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toBe('ADE');
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe('ADE');
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text')).toBeVisible();

  await superdoc.snapshot('tracked-change-partial-insert-after-context-reject');
});
