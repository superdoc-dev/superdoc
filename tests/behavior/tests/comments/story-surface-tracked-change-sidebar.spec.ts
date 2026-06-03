import { test, expect } from '../../fixtures/superdoc.js';
import {
  readStoryOnlyTrackedChangesManifest,
  STORY_ONLY_TRACKED_CHANGES_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { activateTrackedChangeDialog } from '../../helpers/story-tracked-changes.js';
import { getActiveStoryText, getBodyStoryText, waitForActiveStory } from '../../helpers/story-surfaces.js';

const STORY_CASES = readStoryOnlyTrackedChangesManifest();

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
  },
});

for (const entry of STORY_CASES) {
  test(`sidebar tracked-change dialog navigates into the ${entry.surface} story`, async ({ superdoc }) => {
    await superdoc.loadDocument(STORY_ONLY_TRACKED_CHANGES_DOC_PATH);
    await superdoc.waitForStable();

    const bodyBefore = await getBodyStoryText(superdoc.page);
    const { dialog } = await activateTrackedChangeDialog(superdoc, {
      story: entry.story,
      excerpt: entry.excerpt,
    });

    await waitForActiveStory(superdoc.page, entry.story);
    await expect(dialog).toContainText(entry.excerpt);
    await expect.poll(() => getActiveStoryText(superdoc.page)).toContain(entry.excerpt);
    expect(await getBodyStoryText(superdoc.page)).toBe(bodyBefore);
  });
}
