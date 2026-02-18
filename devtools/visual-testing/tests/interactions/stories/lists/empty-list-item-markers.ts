import { defineStory } from '@superdoc-testing/helpers';
import { setTextSelection } from '../../helpers/index.js';

const WAIT_MS = 400;

export default defineStory({
  name: 'empty-list-item-markers',
  description: 'Verify that list markers render correctly for empty list items',
  startDocument: 'test-docs/lists/sd-1543-empty-list-items.docx',
  layout: true,
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { type, waitForStable, milestone } = helpers;

    // Wait for document to fully load
    await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
    await waitForStable(WAIT_MS);

    // Capture the loaded state - empty list items should show their markers
    await milestone('loaded', 'Document loaded with empty list items showing markers');

    // Type into the later empty list item first (position 229) so earlier positions aren't shifted
    await setTextSelection(page, 229);
    await waitForStable(WAIT_MS);

    await type('item 2');
    await waitForStable(WAIT_MS);

    await milestone('typed-item-2', 'After typing into empty list item at position 229');

    // Now type into the earlier empty list item (position 34)
    await setTextSelection(page, 34);
    await waitForStable(WAIT_MS);

    await type('New content in empty list item');
    await waitForStable(WAIT_MS);

    await milestone('typed-in-empty', 'After typing into empty list item at position 34');
  },
});
