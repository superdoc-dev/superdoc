import { defineStory } from '@superdoc-testing/helpers';

const WAIT_LONG_MS = 800;

/**
 * SD-1859: Percent-width tables should not overflow page bounds in mixed orientation docs
 *
 * Uses the actual document from the SD-1859 bug report: NuraBio document
 * which has a percent-width table in a document with mixed portrait/landscape sections.
 * Before the fix, the table overflowed the right edge of portrait pages because
 * column widths were computed using landscape dimensions but rendered in portrait.
 * After the fix, column widths are rescaled to fit the current page's content area.
 */
export default defineStory({
  name: 'percent-width-table-overflow',
  description: 'SD-1859: Percent-width tables should fit within portrait page bounds',
  tickets: ['SD-1859'],
  startDocument: 'tables/SD-1859-mixed-orientation.docx',
  layout: true,
  hideCaret: true,
  hideSelection: true,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Wait for document to load', async () => {
      await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
      await waitForStable(WAIT_LONG_MS);
      await milestone('page1-table', 'Page 1 table should fit within page bounds');
    });

    await step('Scroll to see the table on page 2', async () => {
      await page.evaluate(() => {
        const container = document.querySelector('.harness-main');
        const scrollTarget = container?.querySelector('.superdoc-page:nth-child(2)');
        if (scrollTarget) {
          scrollTarget.scrollIntoView({ block: 'start' });
        }
      });
      await waitForStable(WAIT_LONG_MS);
      await milestone('page2-table', 'Table should not overflow right edge of portrait page');
    });
  },
});
