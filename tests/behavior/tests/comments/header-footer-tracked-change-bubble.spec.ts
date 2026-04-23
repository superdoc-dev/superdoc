import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';
import {
  readStoryOnlyTrackedChangesManifest,
  STORY_ONLY_TRACKED_CHANGES_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { getActiveCommentId, findTrackedChangeComment } from '../../helpers/story-tracked-changes.js';
import { activateFooter, activateHeader } from '../../helpers/story-surfaces.js';

const STORY_CASES = readStoryOnlyTrackedChangesManifest().filter(
  (entry) => entry.surface === 'header' || entry.surface === 'footer',
);

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    showCaret: true,
    showSelection: true,
  },
});

async function clearActiveComment(page: Page) {
  await page.evaluate(() => {
    (window as any).superdoc?.commentsStore?.$patch?.({ activeComment: null });
  });
}

async function dispatchPointerDown(locator: import('@playwright/test').Locator): Promise<void> {
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: rect.left + Math.min(8, Math.max(rect.width / 2, 1)),
        clientY: rect.top + Math.min(8, Math.max(rect.height / 2, 1)),
      }),
    );
  });
}

for (const entry of STORY_CASES) {
  test(`${entry.surface} tracked-change text activates its bubble and a body click clears it`, async ({ superdoc }) => {
    await superdoc.loadDocument(STORY_ONLY_TRACKED_CHANGES_DOC_PATH);
    await superdoc.waitForStable();

    const surface = entry.surface === 'header' ? await activateHeader(superdoc) : await activateFooter(superdoc);

    const comment = await findTrackedChangeComment(superdoc.page, {
      story: entry.story,
      excerpt: entry.excerpt,
    });

    await clearActiveComment(superdoc.page);
    await expect.poll(() => getActiveCommentId(superdoc.page)).toBeNull();

    await dispatchPointerDown(surface.locator('[data-track-change-id]', { hasText: entry.excerpt }).first());
    await superdoc.waitForStable();
    await expect.poll(() => getActiveCommentId(superdoc.page)).toBe(String(comment.commentId ?? comment.importedId));

    const bodyLine = superdoc.page.locator('.superdoc-line').first();
    await bodyLine.waitFor({ state: 'visible', timeout: 15_000 });
    await bodyLine.click();
    await superdoc.waitForStable();
    await expect.poll(() => getActiveCommentId(superdoc.page)).toBeNull();
  });
}
