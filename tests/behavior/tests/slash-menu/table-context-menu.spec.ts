import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

test('context menu opens above table content when right-clicking inside a table', async ({ superdoc }) => {
  await superdoc.type('Text above the table');
  await superdoc.newLine();
  await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  // Right-click inside the table
  const table = superdoc.page.locator('.superdoc-table-fragment').first();
  const tableBox = await table.boundingBox();
  if (!tableBox) throw new Error('Table not visible');

  await superdoc.page.mouse.click(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2, {
    button: 'right',
  });
  await superdoc.waitForStable();

  // Context menu should be visible
  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();

  // The menu's z-index should be higher than the table's z-index so it renders on top
  const zIndices = await superdoc.page.evaluate(() => {
    const menu = document.querySelector('.context-menu') as HTMLElement;
    const table = document.querySelector('.superdoc-table-fragment') as HTMLElement;
    if (!menu || !table) return null;
    return {
      menuZ: Number(getComputedStyle(menu).zIndex) || 0,
      tableZ: Number(getComputedStyle(table).zIndex) || 0,
    };
  });
  expect(zIndices).not.toBeNull();
  expect(zIndices!.menuZ).toBeGreaterThan(zIndices!.tableZ);

  // The menu should not be clipped behind the table — its bounding box should be fully visible
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.width).toBeGreaterThan(0);
  expect(menuBox!.height).toBeGreaterThan(0);

  // Menu should contain table-relevant actions
  const menuItems = menu.locator('.context-menu-item');
  await expect(menuItems.first()).toBeVisible();

  await superdoc.snapshot('table context menu on top of content');
});
