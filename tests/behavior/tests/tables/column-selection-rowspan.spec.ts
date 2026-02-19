import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

async function dragFromCellTextToCellText(
  superdoc: { page: import('@playwright/test').Page; waitForStable: (ms?: number) => Promise<void> },
  fromText: string,
  toText: string,
): Promise<void> {
  const fromLine = superdoc.page.locator('.superdoc-line').filter({ hasText: fromText }).first();
  const toLine = superdoc.page.locator('.superdoc-line').filter({ hasText: toText }).first();

  const fromBox = await fromLine.boundingBox();
  const toBox = await toLine.boundingBox();
  if (!fromBox || !toBox) throw new Error(`Could not resolve drag bounds from "${fromText}" to "${toText}"`);

  const startX = fromBox.x + fromBox.width / 2;
  const startY = fromBox.y + fromBox.height / 2;
  const endX = toBox.x + toBox.width / 2;
  const endY = toBox.y + toBox.height / 2;

  await superdoc.page.mouse.move(startX, startY);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(endX, endY);
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
}

test('selecting a table column works in rows affected by rowspan (PR #1839)', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 5, cols: 3, withHeaderRow: false });
  await superdoc.waitForStable();

  const labels = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'A4', 'B4', 'C4', 'A5', 'B5', 'C5'];

  for (let i = 0; i < labels.length; i += 1) {
    await superdoc.type(labels[i]);
    if (i < labels.length - 1) await superdoc.press('Tab');
  }
  await superdoc.waitForStable();

  // Build rowspan in column A so rows 2-5 start at gridColumnStart=1.
  await dragFromCellTextToCellText(superdoc, 'A1', 'A5');
  await superdoc.executeCommand('mergeCells');
  await superdoc.waitForStable();
  await superdoc.assertTableExists();
  await expect
    .poll(() => superdoc.page.locator('[contenteditable="true"] table td, [contenteditable="true"] table th').count())
    .toBe(11);

  // Select middle column (B*) by pointer drag. This is the rowspan hit-testing path from PR #1839.
  await dragFromCellTextToCellText(superdoc, 'B1', 'B5');

  // Apply formatting to the selected column and assert only B cells changed.
  await superdoc.bold();
  await superdoc.waitForStable();

  for (const label of ['B1', 'B2', 'B3', 'B4', 'B5']) {
    await superdoc.assertTextHasMarks(label, ['bold']);
  }
  // Merged A column and C column must remain unbold.
  for (const label of ['A1', 'C1', 'C2', 'C3', 'C4', 'C5']) {
    await superdoc.assertTextLacksMarks(label, ['bold']);
  }
});
