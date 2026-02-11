import { test } from '../../fixtures/superdoc.js';

test('@behavior insert 2x2 table', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.screenshot('insert-table-2x2');
});
