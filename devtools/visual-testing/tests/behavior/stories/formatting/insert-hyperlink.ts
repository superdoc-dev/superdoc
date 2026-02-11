import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;

export default defineStory({
  name: 'insert-hyperlink',
  description: 'Test creating hyperlinks with correct blue color and underline styling',
  tickets: ['SD-1631'],
  startDocument: null,
  layout: true,
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { type, press, waitForStable, milestone } = helpers;

    // Type some text that will become a hyperlink
    await type('Visit our website for more information');
    await waitForStable(WAIT_MS);
    await milestone('text-typed', 'Document with plain text before hyperlink is created');

    // Select the word "website" by selecting all and then using setTextSelection
    // First, find the position of "website" in the document
    const positions = await page.evaluate(() => {
      const editor = (window as unknown as { editor?: { state?: { doc?: { textContent?: string } } } }).editor;
      if (!editor?.state?.doc) return null;

      const text = editor.state.doc.textContent || '';
      const searchWord = 'website';
      const index = text.indexOf(searchWord);
      if (index === -1) return null;

      // Account for the paragraph node offset (position 1 is start of text content)
      return { from: index + 1, to: index + 1 + searchWord.length };
    });

    if (!positions) {
      throw new Error('Could not find "website" in document');
    }

    // Set selection to the word "website"
    await page.evaluate(({ from, to }) => {
      const editor = (
        window as unknown as {
          editor?: { commands?: { setTextSelection?: (pos: { from: number; to: number }) => boolean } };
        }
      ).editor;
      if (!editor?.commands?.setTextSelection) {
        throw new Error('setTextSelection command not available');
      }
      editor.commands.setTextSelection({ from, to });
    }, positions);

    await waitForStable(WAIT_MS);
    await milestone('text-selected', 'Word "website" selected, ready for hyperlink creation');

    // Apply hyperlink using setLink command
    await page.evaluate(() => {
      const editor = (
        window as unknown as { editor?: { commands?: { setLink?: (opts: { href: string }) => boolean } } }
      ).editor;
      if (!editor?.commands?.setLink) {
        throw new Error('setLink command not available');
      }
      editor.commands.setLink({ href: 'https://example.com' });
    });

    // Clear selection so link color is clearly visible
    await press('ArrowRight');

    await waitForStable(WAIT_MS);
    await milestone('hyperlink-applied', 'After applying hyperlink - text should be blue and underlined');
  },
});
