import { defineStory } from '@superdoc-testing/helpers';

const WAIT_FOR_TABLE_MS = 500;

export default defineStory({
  name: 'insert-table-2x2',
  description: 'Insert a 2x2 table into a blank document.',
  startDocument: null,

  async run(_page, helpers): Promise<void> {
    const { focus, waitForStable, milestone, executeCommand } = helpers;
    await focus();
    await executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await waitForStable(WAIT_FOR_TABLE_MS);
    await milestone(undefined, 'Inserted a 2x2 table without a header row.');
  },
});
