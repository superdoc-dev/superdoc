import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;
const FONT_NAME = 'Courier New';

export default defineStory({
  name: 'clear-format-undo',
  description: 'Clear formatting on styled text, then undo to verify marks are fully restored.',
  tickets: ['SD-1771'],
  startDocument: null,
  layout: true,
  toolbar: 'full',
  waitForFonts: true,

  async run(_page, helpers): Promise<void> {
    const { step, type, newLine, bold, italic, selectAll, undo, focus, executeCommand, waitForStable, milestone } =
      helpers;

    await step('Type and format text', async () => {
      await focus();

      // Type three lines with different formatting
      await bold();
      await type('Bold text here.');
      await bold();
      await newLine();

      await italic();
      await type('Italic text here.');
      await italic();
      await newLine();

      await type('Custom font text.');
      await waitForStable(WAIT_MS);

      // Apply a custom font to the last line
      await selectAll();
      await executeCommand('setFontFamily', FONT_NAME);
      await waitForStable(WAIT_MS);

      await milestone('formatted', 'Text with bold, italic, and Courier New applied.');
    });

    await step('Clear formatting', async () => {
      await selectAll();
      await executeCommand('clearFormat');
      await waitForStable(WAIT_MS);

      await milestone('cleared', 'All formatting cleared from text.');
    });

    await step('Undo clear format', async () => {
      await undo();
      await waitForStable(WAIT_MS);

      await milestone('after-undo', 'Undo restored formatting — bold, italic, and Courier New should reappear.');
    });
  },
});
