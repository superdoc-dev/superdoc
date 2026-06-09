import { test, expect } from '../../fixtures/superdoc.js';
import { assertDocumentApiReady, listTrackChanges } from '../../helpers/document-api.js';
import { findTrackedChangeComment } from '../../helpers/story-tracked-changes.js';

test.use({ config: { toolbar: 'full', comments: 'on', trackChanges: true } });

const BODY_STORY = { kind: 'story', storyType: 'body' } as const;

test('SD-1739 tracked change replacement does not duplicate text in bubble', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('editing');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('suggesting');
  await superdoc.waitForStable();

  // Select "editing" and replace with "redlining"
  await superdoc.tripleClickLine(0);
  await superdoc.waitForStable();
  await superdoc.type('redlining');
  await superdoc.waitForStable();

  await expect
    .poll(async () => (await listTrackChanges(superdoc.page, { type: 'replacement' })).total)
    .toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await listTrackChanges(superdoc.page)).total).toBeGreaterThanOrEqual(1);

  const replacementComment = await findTrackedChangeComment(superdoc.page, {
    story: BODY_STORY,
    excerpt: 'redlining',
    type: 'replacement',
  });
  expect(replacementComment.deletedText).toContain('editing');

  // The floating dialog should show the tracked change with correct text
  // (Bug SD-1739 would show "Added: redliningg" with duplicated trailing char)
  const dialog = superdoc.page.locator('.comment-placeholder .comments-dialog', {
    has: superdoc.page.locator('.tracked-change-text'),
  });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // "Replaced ... with ..." layout — the inserted text must NOT contain "redliningg"
  const addedText = dialog.locator('.tracked-change-text.is-inserted');
  await expect(addedText).toContainText('redlining');
  // Verify exact text doesn't have the duplication bug
  const textContent = await addedText.textContent();
  expect(textContent).not.toContain('redliningg');

  // Deleted text should also be visible
  await expect(dialog.locator('.tracked-change-text.is-deleted')).toBeVisible();

  await superdoc.snapshot('tracked-change-replacement-bubble');
});
