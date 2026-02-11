import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 500;

export default defineStory({
  name: 'reject-format-suggestion',
  description: 'Rejecting a color/format suggestion in suggestion mode restores original styling.',
  tickets: ['SD-1770', 'IT-411'],
  startDocument: null,
  layout: true,
  comments: 'panel',
  hideCaret: true,
  waitForFonts: true,

  async run(page, helpers): Promise<void> {
    const { step, type, selectAll, focus, executeCommand, setDocumentMode, waitForStable, milestone } = helpers;

    // =========================================
    // SETUP: Type text with specific styling
    // =========================================
    await step('Type and style initial text', async () => {
      await focus();
      await type('Agreement signed by both parties');
      await waitForStable(WAIT_MS);

      await selectAll();
      await executeCommand('setFontFamily', 'Times New Roman, serif');
      await executeCommand('setColor', '#112233');
      await waitForStable(WAIT_MS);
      await milestone('initial', 'Text styled with Times New Roman and #112233 color.');
    });

    // =========================================
    // SCENARIO 1: Color suggestion then reject
    // =========================================
    await step('Enter suggesting mode and change color', async () => {
      await setDocumentMode('suggesting');
      await waitForStable(300);

      await selectAll();
      await executeCommand('setColor', '#FF0000');
      await waitForStable(WAIT_MS);
      await milestone('color-suggested', 'Color changed to red in suggesting mode.');
    });

    await step('Reject color suggestion', async () => {
      await executeCommand('rejectAllTrackedChanges');
      await waitForStable(WAIT_MS);
      await milestone('color-rejected', 'Color reverted to #112233, Times New Roman preserved.');
    });

    // =========================================
    // SCENARIO 2: Multi-format suggestion then reject
    // =========================================
    await step('Apply multiple format changes in suggesting mode', async () => {
      await selectAll();
      await executeCommand('toggleBold');
      await executeCommand('toggleUnderline');
      await executeCommand('setColor', '#FF00AA');
      await executeCommand('setFontFamily', 'Arial, sans-serif');
      await waitForStable(WAIT_MS);
      await milestone('multi-format-suggested', 'Bold, underline, color, and font changed in suggesting mode.');
    });

    await step('Reject all multi-format suggestions', async () => {
      await executeCommand('rejectAllTrackedChanges');
      await waitForStable(WAIT_MS);
      await milestone('multi-format-rejected', 'All formatting reverted to original Times New Roman #112233.');
    });
  },
});
