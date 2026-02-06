import { defineStory } from '@superdoc-testing/helpers';
import { clickOnCommentedText, clickOnLine, waitForCommentPanelStable } from '../../helpers/index.js';

const WAIT_MS = 400;
const START_DOC = 'test-docs/comments-tcs/gdocs-comment-on-change.docx';

/**
 * Document structure (gdocs-comment-on-change.docx):
 *
 * Line 1: "T" + [INSERT: "new text"] + [DELETE: "es"] + "t"
 *         - Comments 0 and 1 are on "new text" (the tracked insertion)
 *         - This tests the trackedChangeParentId feature
 *
 * Line 3: "Test"
 *         - Comments 2 and 3 (regular nested comments, no TC)
 *
 * Line 5 (index 4): "test"
 *         - No comments (used for deselection via clickOnLine)
 *
 * This test verifies:
 * - Comments on tracked change text receive background highlighting (bug fix)
 * - Comment takes precedence over TC when both exist at same position
 * - Visual comparison between TC-associated and regular comments
 */
export default defineStory({
  name: 'comment-on-tracked-change',
  description: 'Test comment highlighting on tracked change text',
  startDocument: START_DOC,
  layout: true,
  comments: 'panel',
  trackChanges: true,
  hideCaret: true,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Capture initial state - TC with comment should have highlight', async () => {
      await page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('initial', 'TC text visible; comment on TC has background highlight (the fix)');
    });

    await step('Click on "new text" - comment on tracked change', async () => {
      await clickOnCommentedText(page, 'new text');
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('tc-comment-selected', 'Comment on TC selected, highlight is active');
    });

    await step('Click on "Test" - regular comment (not on TC)', async () => {
      // "Test" is on line 3, has comments 2 and 3 but no tracked change
      await clickOnCommentedText(page, 'Test');
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('regular-comment', 'Regular comment selected for visual comparison');
    });

    await step('Click on line 5 - no comment, deselect', async () => {
      // Line 5 (index 4) contains "test" with no comments
      await clickOnLine(page, 4);
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('deselected', 'No active comment');
    });
  },
});
