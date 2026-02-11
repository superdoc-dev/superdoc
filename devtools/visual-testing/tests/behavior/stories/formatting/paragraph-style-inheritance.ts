import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;

export default defineStory({
  name: 'paragraph-style-inheritance',
  description: 'Test that text typed in new paragraph inherits inline formatting from previous paragraph',
  tickets: ['SD-1657'],
  startDocument: null,
  layout: true,
  hideCaret: true,

  async run(_page, helpers): Promise<void> {
    const { type, press, bold, italic, selectAll, waitForStable, milestone } = helpers;

    // Type initial text
    await type('First paragraph text');
    await waitForStable(WAIT_MS);
    await milestone('text-typed', 'Initial paragraph with plain text');

    // Select all and apply bold
    await selectAll();
    await bold();
    await press('ArrowRight'); // Deselect and position at end
    await waitForStable(WAIT_MS);
    await milestone('bold-applied', 'After applying bold to first paragraph');

    // Press Enter to create new paragraph and type
    await press('Enter');
    await type('Second paragraph text');
    await waitForStable(WAIT_MS);
    await milestone('new-paragraph-typed', 'After typing in new paragraph - text should inherit bold');

    // Select second paragraph and apply italic (in addition to inherited bold)
    await selectAll();
    await italic();
    await press('ArrowRight');
    await waitForStable(WAIT_MS);
    await milestone('italic-applied', 'After applying italic to second paragraph (now bold+italic)');

    // Press Enter again and type third paragraph
    await press('Enter');
    await type('Third paragraph text');
    await waitForStable(WAIT_MS);
    await milestone('third-paragraph-typed', 'After typing in third paragraph - should inherit bold+italic');
  },
});
