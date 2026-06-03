import { test, expect } from '../../fixtures/superdoc.js';
import {
  STORY_ONLY_TRACKED_CHANGES_DOC_PATH,
  readStoryOnlyTrackedChangesManifest,
} from '../../helpers/story-fixtures.js';
import {
  activateFooter,
  activateHeader,
  activateNote,
  getFooterSurfaceLocator,
  getHeaderSurfaceLocator,
  getNoteSurfaceLocator,
} from '../../helpers/story-surfaces.js';

const CONTEXT_MENU_CASES = readStoryOnlyTrackedChangesManifest().filter(
  (entry) => entry.surface === 'header' || entry.surface === 'footer' || entry.surface === 'footnote',
);

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
    showSelection: true,
  },
});

for (const entry of CONTEXT_MENU_CASES) {
  test(`story-surface context menu exposes tracked-change actions for ${entry.surface}`, async ({
    superdoc,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'Firefox collapses selection on right-click natively');

    await superdoc.loadDocument(STORY_ONLY_TRACKED_CHANGES_DOC_PATH);
    await superdoc.waitForStable();

    let surface;
    if (entry.surface === 'header') {
      surface = await activateHeader(superdoc);
    } else if (entry.surface === 'footer') {
      surface = await activateFooter(superdoc);
    } else {
      surface = await activateNote(superdoc, {
        storyType: 'footnote',
        noteId: '1',
        expectedText: 'FN_TC_CHARLIE',
      });
    }

    const renderedSurface =
      entry.surface === 'header'
        ? getHeaderSurfaceLocator(superdoc.page)
        : entry.surface === 'footer'
          ? getFooterSurfaceLocator(superdoc.page)
          : getNoteSurfaceLocator(superdoc.page, { storyType: 'footnote', noteId: '1' });

    const trackedChange = renderedSurface
      .locator('[data-track-change-id], .track-insert[data-id], .track-delete[data-id], .track-format[data-id]', {
        hasText: entry.excerpt,
      })
      .first();
    await expect(trackedChange).toBeVisible();

    const box = await trackedChange.boundingBox();
    expect(box).toBeTruthy();
    const clickX = box!.x + Math.max(4, box!.width / 2);
    const clickY = box!.y + Math.max(4, box!.height / 2);

    await superdoc.page.mouse.click(clickX, clickY, {
      button: 'right',
    });

    const menu = superdoc.page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.context-menu-item').filter({ hasText: 'Accept change' })).toBeVisible();
    await expect(menu.locator('.context-menu-item').filter({ hasText: 'Reject change' })).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox).toBeTruthy();
    expect(Math.abs(menuBox!.x - (clickX + 10))).toBeLessThan(36);
    expect(Math.abs(menuBox!.y - (clickY + 10))).toBeLessThan(36);

    await surface.scrollIntoViewIfNeeded();
  });
}
