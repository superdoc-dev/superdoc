import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';
import {
  readStoryOnlyTrackedChangesManifest,
  STORY_ONLY_TRACKED_CHANGES_DOC_PATH,
} from '../../helpers/story-fixtures.js';
import { findTrackedChangeComment, getCommentsSnapshot } from '../../helpers/story-tracked-changes.js';

const STORY_CASES = readStoryOnlyTrackedChangesManifest();

test.use({
  config: {
    comments: 'panel',
    trackChanges: true,
  },
});

test('imported story-only tracked changes bootstrap sidebar threads for every non-body story', async ({ superdoc }) => {
  await superdoc.loadDocument(STORY_ONLY_TRACKED_CHANGES_DOC_PATH);
  await assertDocumentApiReady(superdoc.page);
  await superdoc.waitForStable();

  await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: 'all' })).total).toBe(STORY_CASES.length);
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBe(0);

  const comments = await getCommentsSnapshot(superdoc.page);
  expect(comments.filter((comment) => comment.trackedChange)).toHaveLength(STORY_CASES.length);

  for (const entry of STORY_CASES) {
    await expect.poll(async () => (await listTrackChanges(superdoc.page, { in: entry.story })).total).toBe(1);

    const comment = await findTrackedChangeComment(superdoc.page, {
      story: entry.story,
      excerpt: entry.excerpt,
    });

    expect(comment.trackedChangeStoryKind).toBe(entry.storyKind);
    if (entry.storyLabel) {
      expect(comment.trackedChangeStoryLabel).toBe(entry.storyLabel);
    } else if (entry.storyLabelPrefix) {
      expect(comment.trackedChangeStoryLabel ?? '').toContain(entry.storyLabelPrefix);
    }
    expect(comment.trackedChangeAnchorKey).toMatch(/^tc::/);
    expect(comment.resolvedTime ?? null).toBeNull();
  }
});
