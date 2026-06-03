import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full' } });

/**
 * Helper: read the `background` attribute of every table cell in document order.
 * Returns an array like [null, { color: 'FF0000' }, null, …].
 */
async function getCellBackgrounds(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    const backgrounds: (Record<string, string> | null)[] = [];
    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        backgrounds.push(node.attrs.background ?? null);
      }
    });
    return backgrounds;
  });
}

/**
 * Helper: create a CellSelection spanning `anchorCellIndex` → `headCellIndex`
 * (0-based indices into the flat list of cells).
 */
async function selectCells(page: import('@playwright/test').Page, anchorCellIndex: number, headCellIndex: number) {
  await page.evaluate(
    ({ anchor, head }) => {
      const editor = (window as any).editor;
      const positions: number[] = [];
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          positions.push(pos);
        }
      });
      if (positions[anchor] === undefined || positions[head] === undefined) {
        throw new Error(`Cell index out of range: anchor=${anchor}, head=${head}, total=${positions.length}`);
      }
      editor.commands.setCellSelection({ anchorCell: positions[anchor], headCell: positions[head] });
    },
    { anchor: anchorCellIndex, head: headCellIndex },
  );
}

/**
 * Helper: right-click on a target to open the context menu, optionally restore
 * a CellSelection (the right-click handler resets it to a TextSelection), then
 * pick "Cell background" → color swatch.
 *
 * @param colorLabel - aria-label of the color option (e.g. "red", "black")
 * @param restoreCellSelection - optional [anchor, head] cell indices to restore after opening
 */
async function applyCellBackgroundViaContextMenu(
  superdoc: any,
  clickTarget: import('@playwright/test').Locator,
  colorLabel: string,
  restoreCellSelection?: [number, number],
) {
  const box = await clickTarget.boundingBox();
  if (!box) throw new Error('Click target not visible');

  // Right-click to open the context menu (this resets CellSelection to TextSelection)
  await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await superdoc.waitForStable();

  // Restore CellSelection if needed — the menu is already open with isInTable=true
  if (restoreCellSelection) {
    await selectCells(superdoc.page, restoreCellSelection[0], restoreCellSelection[1]);
  }

  // Click "Cell background" menu item
  const menu = superdoc.page.locator('.context-menu');
  await expect(menu).toBeVisible();
  const cellBgItem = menu.locator('.context-menu-item').filter({ hasText: 'Cell background' });
  await cellBgItem.click();
  await superdoc.waitForStable();

  // Pick the color from the popover grid
  const colorOption = superdoc.page.locator(`.options-grid-wrap [aria-label="${colorLabel}"]`);
  await expect(colorOption).toBeVisible({ timeout: 3000 });
  await colorOption.click();
  await superdoc.waitForStable();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('cell background via context menu', () => {
  test('apply background to a multi-cell selection across rows', async ({ superdoc }) => {
    // 3×3 table, label cells
    await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
    await superdoc.waitForStable();

    const labels = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'];
    for (let i = 0; i < labels.length; i++) {
      await superdoc.type(labels[i]);
      if (i < labels.length - 1) await superdoc.press('Tab');
    }
    await superdoc.waitForStable();

    // Select 2×2 block: B1, C1, B2, C2 (anchor=B1 index 1, head=C2 index 5)
    await selectCells(superdoc.page, 1, 5);
    await superdoc.waitForStable();

    // Open context menu on the selection and apply red background.
    // Restore the CellSelection after right-click (the context menu handler resets it).
    const targetLine = superdoc.page.locator('.superdoc-line').filter({ hasText: 'B1' }).first();
    await applyCellBackgroundViaContextMenu(superdoc, targetLine, 'red', [1, 5]);

    const backgrounds = await getCellBackgrounds(superdoc.page);
    // cells: A1(0) B1(1) C1(2) A2(3) B2(4) C2(5) A3(6) B3(7) C3(8)
    // Selected 2×2 block: B1(1), C1(2), B2(4), C2(5)
    expect(backgrounds[0]).toBeNull(); // A1 — untouched
    expect(backgrounds[1]).toEqual({ color: 'D2003F' }); // B1
    expect(backgrounds[2]).toEqual({ color: 'D2003F' }); // C1
    expect(backgrounds[3]).toBeNull(); // A2 — untouched
    expect(backgrounds[4]).toEqual({ color: 'D2003F' }); // B2
    expect(backgrounds[5]).toEqual({ color: 'D2003F' }); // C2
    expect(backgrounds[6]).toBeNull(); // A3
    expect(backgrounds[7]).toBeNull(); // B3
    expect(backgrounds[8]).toBeNull(); // C3
  });

  test('apply background to a full column selection', async ({ superdoc }) => {
    await superdoc.executeCommand('insertTable', { rows: 3, cols: 3, withHeaderRow: false });
    await superdoc.waitForStable();

    const labels = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'];
    for (let i = 0; i < labels.length; i++) {
      await superdoc.type(labels[i]);
      if (i < labels.length - 1) await superdoc.press('Tab');
    }
    await superdoc.waitForStable();

    // Select entire middle column (B1→B3 — anchor=1, head=7)
    await selectCells(superdoc.page, 1, 7);
    await superdoc.waitForStable();

    // Restore column selection after right-click
    const targetLine = superdoc.page.locator('.superdoc-line').filter({ hasText: 'B2' }).first();
    await applyCellBackgroundViaContextMenu(superdoc, targetLine, 'forest green', [1, 7]);

    const backgrounds = await getCellBackgrounds(superdoc.page);
    // Column B = indices 1, 4, 7; all others should be null
    for (let i = 0; i < 9; i++) {
      if ([1, 4, 7].includes(i)) {
        expect(backgrounds[i]).toEqual({ color: '055432' });
      } else {
        expect(backgrounds[i]).toBeNull();
      }
    }
  });

  test('apply background to a single cell via right-click (no CellSelection)', async ({ superdoc }) => {
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    // Type in cells so we can identify them
    await superdoc.type('A1');
    await superdoc.press('Tab');
    await superdoc.type('B1');
    await superdoc.press('Tab');
    await superdoc.type('A2');
    await superdoc.press('Tab');
    await superdoc.type('B2');
    await superdoc.waitForStable();

    // Click inside cell A2 (just place cursor, no CellSelection)
    const a2Line = superdoc.page.locator('.superdoc-line').filter({ hasText: 'A2' }).first();
    const a2Box = await a2Line.boundingBox();
    if (!a2Box) throw new Error('A2 line not visible');
    await superdoc.page.mouse.click(a2Box.x + a2Box.width / 2, a2Box.y + a2Box.height / 2);
    await superdoc.waitForStable();

    // Right-click → Cell background → pick a color (no CellSelection restore needed)
    await applyCellBackgroundViaContextMenu(superdoc, a2Line, 'navy blue');

    const backgrounds = await getCellBackgrounds(superdoc.page);
    // Only A2 (index 2) should be coloured
    expect(backgrounds[0]).toBeNull(); // A1
    expect(backgrounds[1]).toBeNull(); // B1
    expect(backgrounds[2]).toEqual({ color: '063E7E' }); // A2
    expect(backgrounds[3]).toBeNull(); // B2
  });

  test('remove background with "None" option', async ({ superdoc }) => {
    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    await superdoc.type('A1');
    await superdoc.press('Tab');
    await superdoc.type('B1');
    await superdoc.press('Tab');
    await superdoc.type('A2');
    await superdoc.press('Tab');
    await superdoc.type('B2');
    await superdoc.waitForStable();

    // Select cell A1 and apply a colour
    await selectCells(superdoc.page, 0, 0);
    await superdoc.waitForStable();

    const a1Line = superdoc.page.locator('.superdoc-line').filter({ hasText: 'A1' }).first();
    await applyCellBackgroundViaContextMenu(superdoc, a1Line, 'red', [0, 0]);

    let backgrounds = await getCellBackgrounds(superdoc.page);
    expect(backgrounds[0]).toEqual({ color: 'D2003F' });

    // Now remove it via "None"
    const a1Box = await a1Line.boundingBox();
    if (!a1Box) throw new Error('A1 line not visible');
    await superdoc.page.mouse.click(a1Box.x + a1Box.width / 2, a1Box.y + a1Box.height / 2, { button: 'right' });
    await superdoc.waitForStable();

    // Restore single-cell CellSelection so setCellAttr works
    await selectCells(superdoc.page, 0, 0);

    const menu = superdoc.page.locator('.context-menu');
    await expect(menu).toBeVisible();
    await menu.locator('.context-menu-item').filter({ hasText: 'Cell background' }).click();
    await superdoc.waitForStable();

    const noneOption = superdoc.page.locator('.options-grid-wrap .none-option');
    await expect(noneOption).toBeVisible({ timeout: 3000 });
    await noneOption.click();
    await superdoc.waitForStable();

    backgrounds = await getCellBackgrounds(superdoc.page);
    expect(backgrounds[0]).toBeNull();
  });
});
