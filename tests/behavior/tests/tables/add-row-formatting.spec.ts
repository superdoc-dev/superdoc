import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('adding a row after bold cell preserves formatting in new row', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Type bold text in the first cell
  await superdoc.bold();
  await superdoc.type('Bold header');
  await superdoc.waitForStable();

  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);

  // Add a row after the current one
  await superdoc.executeCommand('addRowAfter');
  await superdoc.waitForStable();
  await superdoc.assertTableExists(3, 2);

  // Type in the new row — bold carries over from the source row
  await superdoc.type('New row text');
  await superdoc.waitForStable();

  await superdoc.assertTextContains('New row text');
  await superdoc.assertTextContains('Bold header');

  // The new text inherits bold from the row it was cloned from.
  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
});
