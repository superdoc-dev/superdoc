import { test, expect } from '../../fixtures/superdoc.js';
import { countTableCells } from '../../helpers/table.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

test('insert table via toolbar grid', async ({ superdoc }) => {
  await superdoc.type('Text before table');
  await superdoc.newLine();
  await superdoc.waitForStable();
  await superdoc.snapshot('text typed');

  // Open the table dropdown
  const tableButton = superdoc.page.locator('[data-item="btn-table"]');
  await tableButton.click();
  await superdoc.waitForStable();
  await superdoc.snapshot('table grid open');

  // Click the 3x3 cell in the grid (data-cols="3" data-rows="3")
  const cell = superdoc.page.locator('.toolbar-table-grid__item[data-cols="3"][data-rows="3"]');
  await cell.click();
  await superdoc.waitForStable();
  await superdoc.snapshot('3x3 table inserted');

  // Assert table exists with 3 rows and 3 columns
  await superdoc.assertTableExists(3, 3);
});

test('header-row tables count headers as cells', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 3, withHeaderRow: true });
  await superdoc.waitForStable();
  await superdoc.snapshot('2x3 header-row table inserted');

  await superdoc.assertTableExists(2, 3);
  await expect.poll(() => countTableCells(superdoc.page)).toBe(6);
});

test('type and navigate between cells with Tab', async ({ superdoc }) => {
  // Insert a 2x2 table
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.snapshot('empty 2x2 table');

  // Type in first cell
  await superdoc.type('Cell A1');

  // Tab to next cell and type
  await superdoc.press('Tab');
  await superdoc.type('Cell B1');

  // Tab to next row
  await superdoc.press('Tab');
  await superdoc.type('Cell A2');

  await superdoc.press('Tab');
  await superdoc.type('Cell B2');
  await superdoc.waitForStable();
  await superdoc.snapshot('all cells filled');

  // Assert all cell text exists
  await superdoc.assertTextContains('Cell A1');
  await superdoc.assertTextContains('Cell B1');
  await superdoc.assertTextContains('Cell A2');
  await superdoc.assertTextContains('Cell B2');
});

test('add and delete rows via table actions toolbar', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();
  await superdoc.assertTableExists(2, 2);

  // Type in first cell so cursor is inside table
  await superdoc.type('Hello');
  await superdoc.waitForStable();
  await superdoc.snapshot('initial 2x2 table');

  // Open table actions dropdown and add row after
  const tableActionsButton = superdoc.page.locator('[data-item="btn-tableActions"]');
  await tableActionsButton.click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[aria-label="Add row after"]').click();
  await superdoc.waitForStable();
  await superdoc.assertTableExists(3, 2);
  await superdoc.snapshot('after add row (3x2)');

  // Add column after
  await tableActionsButton.click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[aria-label="Add column after"]').click();
  await superdoc.waitForStable();
  await superdoc.assertTableExists(3, 3);
  await superdoc.snapshot('after add column (3x3)');

  // Delete the row we added
  await tableActionsButton.click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[aria-label="Delete row"]').click();
  await superdoc.waitForStable();
  await superdoc.assertTableExists(2, 3);
  await superdoc.snapshot('after delete row (2x3)');

  // Delete the column we added
  await tableActionsButton.click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[aria-label="Delete column"]').click();
  await superdoc.waitForStable();
  await superdoc.assertTableExists(2, 2);
  await superdoc.snapshot('after delete column (2x2)');
});

test('merge and split cells', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Type in first cell
  await superdoc.type('Merge me');
  await superdoc.waitForStable();
  await superdoc.snapshot('table with text');

  // Select the first two cells in the first row using CellSelection
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { state } = editor;
    let firstCellPos = -1;
    let secondCellPos = -1;
    let cellCount = 0;

    state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        cellCount++;
        if (cellCount === 1) firstCellPos = pos;
        if (cellCount === 2) secondCellPos = pos;
      }
    });

    if (firstCellPos !== -1 && secondCellPos !== -1) {
      editor.commands.setCellSelection({ anchorCell: firstCellPos, headCell: secondCellPos });
    }
  });
  await superdoc.waitForStable();
  await superdoc.snapshot('two cells selected');

  // Merge the selected cells
  await superdoc.executeCommand('mergeCells');
  await superdoc.waitForStable();
  await superdoc.snapshot('cells merged');

  // Count cells — first row should have 1 cell instead of 2
  const cellCount = await countTableCells(superdoc.page);
  // 2x2 table with first row merged = 3 cells (1 merged + 2 in second row)
  expect(cellCount).toBe(3);

  // Split the merged cell back
  await superdoc.executeCommand('splitCell');
  await superdoc.waitForStable();
  await superdoc.snapshot('cells split back');

  const cellCountAfterSplit = await countTableCells(superdoc.page);
  expect(cellCountAfterSplit).toBe(4);
});
