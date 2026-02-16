import { test } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('@behavior SD-1973 table context menu renders above content', async ({ superdoc }) => {
  // Build a document with text above and below a table (matches the regression scenario)
  await superdoc.type('Text above the table');
  await superdoc.newLine();
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  // Move below the table and add text
  await superdoc.press('ArrowDown');
  await superdoc.press('ArrowDown');
  await superdoc.press('ArrowDown');
  await superdoc.press('ArrowDown');
  await superdoc.newLine();
  await superdoc.type('Text below the table');
  await superdoc.waitForStable();

  // Right-click inside the table to open the context menu
  const table = superdoc.page.locator('.superdoc-table-fragment').first();
  const box = await table.boundingBox();
  if (!box) throw new Error('Table not visible');

  await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  // Verify the slash menu is visible and screenshot it
  const menu = superdoc.page.locator('.slash-menu');
  await menu.waitFor({ state: 'visible', timeout: 3000 });

  await superdoc.screenshot('table-context-menu-above-content');
});
