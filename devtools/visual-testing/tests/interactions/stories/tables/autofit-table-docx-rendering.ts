import { defineStory } from '@superdoc-testing/helpers';

const WAIT_LONG_MS = 800;

/**
 * SD-1895: Auto-layout tables from DOCX should fill page width
 *
 * Uses the actual document from the SD-1895 bug report which has
 * auto-layout tables with column widths defined by cell size.
 * Before the fix, columns rendered at their raw measurement widths
 * leaving unused space. After the fix, columns scale up to fill
 * the available page width.
 */
export default defineStory({
  name: 'autofit-table-docx-rendering',
  description: 'SD-1895: Auto-layout tables from DOCX should fill page width',
  tickets: ['SD-1895'],
  startDocument: 'tables/SD-1895-autofit-issue.docx',
  layout: true,
  hideCaret: true,
  hideSelection: true,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Wait for document to load', async () => {
      await page.waitForSelector('.superdoc-page', { timeout: 30_000 });
      await waitForStable(WAIT_LONG_MS);
      await milestone('page1-autofit-table', 'Auto-layout table should fill page width');
    });

    await step('Scroll to page 2 if present', async () => {
      const hasPage2 = await page.evaluate(() => {
        const pages = document.querySelectorAll('.superdoc-page');
        if (pages.length > 1) {
          const container = document.querySelector('.harness-main');
          pages[1].scrollIntoView({ block: 'start' });
          return true;
        }
        return false;
      });
      if (hasPage2) {
        await waitForStable(WAIT_LONG_MS);
        await milestone('page2-autofit-table', 'Table on page 2 should also fill page width');
      }
    });
  },
});
