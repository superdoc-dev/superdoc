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

async function clickRenderedTrackedChange(page: Page, locator: import('@playwright/test').Locator): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Tracked-change marker is not clickable: no bounding box available.');
  }

  await page.mouse.click(
    box.x + Math.min(8, Math.max(box.width / 2, 1)),
    box.y + Math.min(8, Math.max(box.height / 2, 1)),
  );
}

async function clickNeutralDocumentArea(page: Page): Promise<void> {
  const layers = page.locator('.superdoc__layers').first();
  await layers.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await layers.boundingBox();
  if (!box) throw new Error('Layers root is not clickable: no bounding box available.');

  const candidates = [
    { x: box.x + 12, y: box.y + 12 },
    { x: box.x + 12, y: box.y + box.height * 0.5 },
    { x: box.x + 12, y: box.y + Math.max(12, box.height - 12) },
  ];

  for (const point of candidates) {
    const safe = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      if (!el.closest('.superdoc__layers')) return false;
      if (el.closest('.superdoc__compact-comment-popover')) return false;
      if (el.closest('[data-track-change-id], .superdoc-comment-highlight, .sd-comment-anchor')) return false;
      return true;
    }, point);
    if (!safe) continue;
    await page.mouse.click(point.x, point.y);
    return;
  }

  throw new Error('Unable to find a neutral document-area click point.');
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

    await clickRenderedTrackedChange(
      superdoc.page,
      surface.locator('[data-track-change-id]', { hasText: entry.excerpt }).first(),
    );
    await superdoc.waitForStable();
    await expect.poll(() => getActiveCommentId(superdoc.page)).toBe(String(comment.commentId ?? comment.importedId));

    await clickNeutralDocumentArea(superdoc.page);
    await superdoc.waitForStable();
    await expect.poll(() => getActiveCommentId(superdoc.page)).toBeNull();
  });
}
