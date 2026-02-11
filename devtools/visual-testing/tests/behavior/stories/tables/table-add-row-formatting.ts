import { defineStory } from '@superdoc-testing/helpers';

const WAIT_MS = 300;
const WAIT_LONG_MS = 500;

export default defineStory({
  name: 'table-add-row-formatting',
  description: 'Test that addRowBefore/addRowAfter preserve paragraph formatting from the source row.',
  tickets: ['SD-1191'],
  startDocument: null,
  layout: true,

  async run(_page, helpers): Promise<void> {
    const { step, type, focus, waitForStable, milestone, executeCommand, bold } = helpers;

    await step('Insert table', async () => {
      await focus();
      await executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
      await waitForStable(WAIT_LONG_MS);
      await milestone('table-inserted', 'Inserted a 2x2 table.');
    });

    await step('Format first row with bold', async () => {
      // Enable bold mode first, then type - cursor stays in table cell
      await bold();
      await type('Bold text');
      await waitForStable(WAIT_MS);
      await milestone('first-row-formatted', 'Typed bold text in first cell.');
    });

    await step('Add row after', async () => {
      // Add a new row after the current row
      await executeCommand('addRowAfter');
      await waitForStable(WAIT_MS);
      await milestone('after-add-row-after', 'Added new row after formatted row.');
    });

    await step('Type in new row to verify formatting', async () => {
      // Cursor should be in new row, type to verify bold formatting is preserved
      await type('New row text');
      await waitForStable(WAIT_MS);
      await milestone('typed-in-new-row', 'Typed in new row - text should inherit bold formatting.');
    });

    await step('Add row before', async () => {
      // Add a row before the current position
      await executeCommand('addRowBefore');
      await waitForStable(WAIT_MS);
      await milestone('after-add-row-before', 'Added row before current row.');
    });

    await step('Type in before row to verify formatting', async () => {
      // Type to verify formatting preserved in row added before
      await type('Before row text');
      await waitForStable(WAIT_MS);
      await milestone('typed-in-before-row', 'Typed in before row - text should inherit bold formatting.');
    });
  },
});
