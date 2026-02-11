import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

export default defineStory({
  name: 'same-level-same-indicator',
  description: 'Verify list items with same indicator at same level render correctly (not sequentially)',
  tickets: ['SD-1658'],
  startDocument: 'test-docs/lists/sd-1658-lists-same-level.docx',
  layout: true,
  hideCaret: true,

  async run(page, helpers): Promise<void> {
    const { waitForStable, milestone } = helpers;

    // Wait for document to fully load
    await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
    await waitForStable(WAIT_MS);

    // Capture the loaded state - list items with same indicator (e.g., b, b, b) should NOT render as sequential (b, c, d)
    await milestone('loaded', 'Document loaded with list items showing same indicator at same level');
  },
});
