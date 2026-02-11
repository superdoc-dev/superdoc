import { defineStory } from '@superdoc-testing/helpers';

export default defineStory({
  name: 'toggle-formatting-off',
  description: 'Test that toggling bold off from toolbar only affects selected text',
  tickets: ['SD-1727'],
  startDocument: 'styles/sd-1727-formatting-lost.docx',
  toolbar: 'full',
  layout: true,
  hideCaret: false,
  hideSelection: false,

  async run(page, helpers): Promise<void> {
    const { type, press, bold, italic, selectAll, clickAt, waitForStable, milestone } = helpers;

    // Wait for document to fully load
    await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
    await waitForStable(400);
    await milestone('initial', 'Document loaded');

    // Click inside document to focus, then select all
    await clickAt(300, 150);
    await waitForStable(400);

    // Step 1: Highlight the text and select bold from the toolbar
    await selectAll();
    await waitForStable(400);
    await milestone('text-selected', 'Text highlighted');

    await bold();
    await press('ArrowRight'); // Deselect
    await waitForStable(400);
    await milestone('bold-applied', 'Bold applied to text');

    // Step 2: Toggle bold off without changing anything else
    await bold();
    await waitForStable(400);
    await milestone('bold-toggled-off', 'Bold toggled off - text should retain formatting');

    // Step 3: New line, enable italic before typing, then type
    await press('Enter');
    await italic();
    await type('hello italic');
    await waitForStable(400);
    await milestone('italic-typed', 'Typed with italic enabled - text should be italic');
  },
});
