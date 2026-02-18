import { test } from '../../fixtures/superdoc.js';

test('@behavior table row addition preserves formatting', async ({ superdoc }) => {
  // Insert 2x2 table
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Type bold text in first cell
  await superdoc.bold();
  await superdoc.type('Bold header');
  await superdoc.bold();
  await superdoc.screenshot('table-before-add-row');

  // Add row after and type in it
  await superdoc.executeCommand('addRowAfter');
  await superdoc.waitForStable();
  await superdoc.type('New row text');
  await superdoc.screenshot('table-after-add-row');
});
