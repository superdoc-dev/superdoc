import { test, expect } from '../fixtures/superdoc.ts';
import { rightClickAtDocPos } from '../../../behavior/helpers/editor-interactions.js';
import { getMarkedText, getSelectedText, insertTrackedChange } from '../../../behavior/helpers/tracked-changes.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'panel',
    trackChanges: true,
    hideSelection: false,
  },
});

const TRACK_TEXT = 'ABCDE';
const PARTIAL_TEXT = 'BC';

async function getDocumentText(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => (window as any).editor.doc.getText({}));
}

test('@behavior toolbar accept partially resolves a tracked insertion', async ({ superdoc }) => {
  await insertTrackedChange(superdoc.page, { from: 1, to: 1, text: TRACK_TEXT });
  await superdoc.waitForStable();

  const selection = await superdoc.findTextRange(PARTIAL_TEXT);
  await superdoc.setTextSelection(selection.from, selection.to);
  await superdoc.waitForStable();

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: TRACK_TEXT }),
  });
  await expect(trackedDialog).toBeVisible();

  await superdoc.screenshot('tracked-change-partial-insert-before-accept');

  await superdoc.executeCommand('acceptTrackedChangeFromToolbar');
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toBe(TRACK_TEXT);
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe('ADE');
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text')).toBeVisible();

  await superdoc.screenshot('tracked-change-partial-insert-after-accept');
});

test('@behavior context menu reject partially resolves a tracked insertion', async ({ superdoc, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox collapses selection on right-click natively');

  await insertTrackedChange(superdoc.page, { from: 1, to: 1, text: TRACK_TEXT });
  await superdoc.waitForStable();

  const selection = await superdoc.findTextRange(PARTIAL_TEXT);
  await superdoc.setTextSelection(selection.from, selection.to);
  await superdoc.waitForStable();

  await expect.poll(() => getSelectedText(superdoc.page)).toBe(PARTIAL_TEXT);

  const trackedDialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text.is-inserted', { hasText: TRACK_TEXT }),
  });
  await expect(trackedDialog).toBeVisible();

  await superdoc.screenshot('tracked-change-partial-insert-before-context-reject');

  await rightClickAtDocPos(superdoc.page, selection.from + 1);
  await superdoc.waitForStable();

  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  await menu.locator('.context-menu-item').filter({ hasText: 'Reject change' }).click();
  await superdoc.waitForStable();

  await expect.poll(() => getDocumentText(superdoc.page)).toBe('ADE');
  await expect.poll(() => getMarkedText(superdoc.page, 'trackInsert')).toBe('ADE');
  await expect(superdoc.page.locator('.comment-placeholder .comments-dialog .tracked-change-text')).toBeVisible();

  await superdoc.screenshot('tracked-change-partial-insert-after-context-reject');
});
