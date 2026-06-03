import { test, expect, type Locator, type Page, type SuperDocFixture } from '../../fixtures/superdoc.js';
import { listTrackChanges } from '../../helpers/document-api.js';
import {
  readStoryOnlyTrackedChangesManifest,
  STORY_ONLY_TRACKED_CHANGES_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { acceptTrackedChangeFromSidebar, rejectTrackedChangeFromSidebar } from '../../helpers/story-tracked-changes.js';
import {
  activateFooter,
  activateHeader,
  expectActiveStoryTextToContain,
  getFooterSurfaceLocator,
  getHeaderSurfaceLocator,
  getNoteSurfaceLocator,
} from '../../helpers/story-surfaces.js';

const STORY_CASES = readStoryOnlyTrackedChangesManifest();

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
  },
});

function getSurfaceLocator(page: Page, surface: (typeof STORY_CASES)[number]['surface']): Locator {
  if (surface === 'header') return getHeaderSurfaceLocator(page);
  if (surface === 'footer') return getFooterSurfaceLocator(page);
  return getNoteSurfaceLocator(page, {
    storyType: surface,
    noteId: '1',
  });
}

async function expectSurfaceExcerpt(
  superdoc: SuperDocFixture,
  entry: (typeof STORY_CASES)[number],
  visible: boolean,
): Promise<void> {
  const surface = getSurfaceLocator(superdoc.page, entry.surface);
  await surface.scrollIntoViewIfNeeded();
  if (visible) {
    if (entry.surface === 'header') {
      await activateHeader(superdoc);
      await expectActiveStoryTextToContain(superdoc.page, entry.excerpt);
      return;
    }

    if (entry.surface === 'footer') {
      await activateFooter(superdoc);
      await expectActiveStoryTextToContain(superdoc.page, entry.excerpt);
      return;
    }

    await expect(surface).toContainText(entry.excerpt);
    return;
  }

  await expect(surface).not.toContainText(entry.excerpt);
}

for (const entry of STORY_CASES) {
  test(`accept from sidebar resolves only the ${entry.surface} tracked change and supports undo/redo`, async ({
    superdoc,
  }) => {
    await superdoc.loadDocument(STORY_ONLY_TRACKED_CHANGES_DOC_PATH);
    await superdoc.waitForStable();

    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length);
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(1);
    await expectSurfaceExcerpt(superdoc, entry, true);

    await acceptTrackedChangeFromSidebar(superdoc, {
      story: entry.story,
      excerpt: entry.excerpt,
    });

    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(0);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length - 1);
    await expectSurfaceExcerpt(superdoc, entry, true);

    for (const otherEntry of STORY_CASES.filter((candidate) => candidate.surface !== entry.surface)) {
      await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: otherEntry.story })).total).toBe(1);
    }

    await superdoc.undo();
    await superdoc.waitForStable();
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(1);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length);
    await expectSurfaceExcerpt(superdoc, entry, true);

    await superdoc.redo();
    await superdoc.waitForStable();
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(0);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length - 1);
    await expectSurfaceExcerpt(superdoc, entry, true);
  });

  test(`reject from sidebar resolves only the ${entry.surface} tracked change and supports undo/redo`, async ({
    superdoc,
  }) => {
    await superdoc.loadDocument(STORY_ONLY_TRACKED_CHANGES_DOC_PATH);
    await superdoc.waitForStable();

    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length);
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(1);
    await expectSurfaceExcerpt(superdoc, entry, true);

    await rejectTrackedChangeFromSidebar(superdoc, {
      story: entry.story,
      excerpt: entry.excerpt,
    });

    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(0);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length - 1);
    await expectSurfaceExcerpt(superdoc, entry, false);

    for (const otherEntry of STORY_CASES.filter((candidate) => candidate.surface !== entry.surface)) {
      await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: otherEntry.story })).total).toBe(1);
    }

    await superdoc.undo();
    await superdoc.waitForStable();
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(1);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length);
    await expectSurfaceExcerpt(superdoc, entry, true);

    await superdoc.redo();
    await superdoc.waitForStable();
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(0);
    await expect
      .poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total)
      .toBe(STORY_CASES.length - 1);
    await expectSurfaceExcerpt(superdoc, entry, false);
  });
}
