import { defineStory } from '@superdoc-testing/helpers';
import { clickOnCommentedText, clickOnLine, waitForCommentPanelStable } from '../../helpers/index.js';

const WAIT_MS = 400;
const START_DOC = 'test-docs/comments-tcs/nested-comments-gdocs.docx';

/**
 * Document structure (nested-comments-gdocs.docx):
 *
 * Same content as nested-comments-word.docx but exported from Google Docs.
 * Google Docs exports lack commentsExtended.xml, so threading is inferred differently.
 *
 * Comment 0: "Licensee shall not (a) copy, modify...distribute" (outer)
 * Comment 1: "modify" (inner, nested inside comment 0)
 * Comment 2: "proprietary notices"
 * Comment 3: "notices or labels" (overlaps with 2 on "notices")
 * Comment 4: "notices or labels" (reply to 3)
 *
 * This test verifies the same visual behavior as nested-comments-word.ts
 * but with a Google Docs source document to catch any GDocs-specific rendering issues.
 */
export default defineStory({
  name: 'nested-comments-gdocs',
  description: 'Test nested and overlapping comment highlighting from Google Docs document',
  startDocument: START_DOC,
  layout: true,
  comments: 'panel',
  hideCaret: true,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Capture initial state with all comments', async () => {
      await page.waitForSelector('.superdoc-comment-highlight', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('initial', 'All comment ranges should have default yellow highlight');
    });

    await step('Click on "modify" - innermost nested comment', async () => {
      await clickOnCommentedText(page, 'modify');
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('inner-selected', 'Inner comment active, outer should show box-shadow indicator');
    });

    await step('Click on "Licensee" - outer comment only', async () => {
      await clickOnCommentedText(page, 'Licensee');
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('outer-selected', 'Outer comment highlighted, inner loses active styling');
    });

    await step('Click on "proprietary" - first overlap area (comment 2 only)', async () => {
      await clickOnCommentedText(page, 'proprietary');
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('overlap-first', 'Comment on "proprietary notices" selected');
    });

    await step('Click on "labels" - second overlap area (comments 3/4 only)', async () => {
      await clickOnCommentedText(page, 'labels');
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('overlap-second', 'Comment on "notices or labels" selected');
    });

    await step('Click outside all comments to deselect', async () => {
      await clickOnLine(page, 1, 50);
      await waitForCommentPanelStable(page, WAIT_MS);
      await milestone('deselected', 'All comments return to default highlight state');
    });
  },
});
