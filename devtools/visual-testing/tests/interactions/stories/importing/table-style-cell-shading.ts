import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;

export default defineStory({
  name: 'table-style-cell-shading',
  description:
    'Test that table cell shading from conditional table styles (GridTable4-Accent1) renders correctly via the style-engine cascade.',
  tickets: ['SD-1833'],
  startDocument: 'tables/cell-shading.docx',
  layout: true,
  hideCaret: true,
  hideSelection: true,

  async run(page, helpers): Promise<void> {
    const { step, waitForStable, milestone } = helpers;

    await step('Verify document loads with table style shading', async () => {
      await page.waitForSelector('.ProseMirror', { timeout: 30_000 });
      await waitForStable(WAIT_MS);
      await milestone('loaded', 'Table cells should show conditional shading (firstRow #156082, band1Horz #C1E4F5)');
    });
  },
});
