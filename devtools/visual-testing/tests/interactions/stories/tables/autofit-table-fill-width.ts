import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 400;
const WAIT_LONG_MS = 800;

/**
 * SD-1895: Auto-layout tables should fill page width
 *
 * Tables inserted via the editor use auto-layout mode. With the fix,
 * auto-layout tables scale their column widths UP to fill the available
 * page width (matching Word behavior) rather than leaving unused space.
 *
 * This test inserts tables with different column counts and verifies
 * they render cleanly filling the page width.
 */
export default defineStory({
  name: 'autofit-table-fill-width',
  description: 'Verify auto-layout tables fill page width with proportional columns',
  tickets: ['SD-1895'],
  startDocument: null,
  layout: true,
  hideCaret: true,
  hideSelection: true,

  async run(_page, helpers): Promise<void> {
    const { step, focus, type, press, waitForStable, milestone, executeCommand } = helpers;

    await step('Insert a 4-column table', async () => {
      await focus();
      await type('Table with 4 columns:');
      await press('Enter');
      await executeCommand('insertTable', { rows: 3, cols: 4, withHeaderRow: false });
      await waitForStable(WAIT_LONG_MS);
    });

    await step('Fill table cells with content', async () => {
      // Row 1
      await type('Name');
      await press('Tab');
      await type('Department');
      await press('Tab');
      await type('Role');
      await press('Tab');
      await type('Status');
      // Row 2
      await press('Tab');
      await type('Alice Smith');
      await press('Tab');
      await type('Engineering');
      await press('Tab');
      await type('Senior Developer');
      await press('Tab');
      await type('Active');
      // Row 3
      await press('Tab');
      await type('Bob Johnson');
      await press('Tab');
      await type('Marketing');
      await press('Tab');
      await type('Content Lead');
      await press('Tab');
      await type('Active');
      await waitForStable(WAIT_LONG_MS);
      await milestone('four-column-table', 'Table with 4 columns should fill page width');
    });

    await step('Add paragraph and insert 6-column table', async () => {
      // Move cursor after table
      await press('ArrowDown');
      await press('ArrowDown');
      await waitForStable(WAIT_MS);
      await press('Enter');
      await type('Table with 6 columns:');
      await press('Enter');
      await executeCommand('insertTable', { rows: 2, cols: 6, withHeaderRow: false });
      await waitForStable(WAIT_LONG_MS);
    });

    await step('Fill 6-column table', async () => {
      await type('Col 1');
      await press('Tab');
      await type('Col 2');
      await press('Tab');
      await type('Col 3');
      await press('Tab');
      await type('Col 4');
      await press('Tab');
      await type('Col 5');
      await press('Tab');
      await type('Col 6');
      await press('Tab');
      await type('Data A');
      await press('Tab');
      await type('Data B');
      await press('Tab');
      await type('Data C');
      await press('Tab');
      await type('Data D');
      await press('Tab');
      await type('Data E');
      await press('Tab');
      await type('Data F');
      await waitForStable(WAIT_LONG_MS);
      await milestone('six-column-table', 'Both tables should fill page width with proportional columns');
    });
  },
});
