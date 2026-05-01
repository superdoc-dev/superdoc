import { test, expect } from '../../fixtures/superdoc.js';
import { insertTrackedChange } from '../../../../behavior/helpers/tracked-changes.js';

test.use({
  config: {
    toolbar: 'full',
    comments: 'panel',
    trackChanges: true,
    hideCaret: true,
    hideSelection: true,
  },
});

const PREFIX = 'an ';
const TRACK_TEXT = 'recommend';
const SUFFIX = ' on this an addition';
const BASE_TEXT = `${PREFIX}${SUFFIX}`;

test('@behavior tracked change selected state is visually distinct without changing line layout', async ({
  superdoc,
}) => {
  await superdoc.type(BASE_TEXT);
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  const insertionPoint = await superdoc.findTextRange(SUFFIX);
  await insertTrackedChange(superdoc.page, {
    from: insertionPoint.from,
    to: insertionPoint.from,
    text: TRACK_TEXT,
  });
  await superdoc.waitForStable();

  const tracked = superdoc.page.locator('[data-track-change-id]').filter({ hasText: TRACK_TEXT }).first();
  await expect(tracked).toBeVisible();
  await expect(tracked).not.toHaveClass(/track-change-focused/);

  await superdoc.screenshot('behavior-comments-tcs-tracked-change-not-selected');

  await tracked.click();
  await superdoc.waitForStable();
  await expect(tracked).toHaveClass(/track-change-focused/);

  await superdoc.screenshot('behavior-comments-tcs-tracked-change-selected');
});
