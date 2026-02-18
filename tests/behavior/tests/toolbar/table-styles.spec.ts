import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Insert a 2x2 table, type text in the first cell, select it, and return the position.
 */
async function insertTableAndTypeInCell(superdoc: SuperDocFixture, text: string): Promise<number> {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  await superdoc.type(text);
  await superdoc.waitForStable();

  const pos = await superdoc.findTextPos(text);
  await superdoc.setTextSelection(pos, pos + text.length);
  await superdoc.waitForStable();

  return pos;
}

test('bold inside a table cell', async ({ superdoc }) => {
  await insertTableAndTypeInCell(superdoc, 'table text');
  await superdoc.snapshot('table text selected');

  const boldButton = superdoc.page.locator('[data-item="btn-bold"]');
  await boldButton.click();
  await superdoc.waitForStable();

  await expect(boldButton).toHaveClass(/active/);
  await superdoc.snapshot('bold applied in cell');

  const pos = await superdoc.findTextPos('table text');
  await superdoc.assertMarksAtPos(pos, ['bold']);
});

test('multiple styles in one cell', async ({ superdoc }) => {
  await insertTableAndTypeInCell(superdoc, 'styled cell');
  await superdoc.snapshot('text selected in cell');

  // Apply bold + italic + color
  await superdoc.page.locator('[data-item="btn-bold"]').click();
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-italic"]').click();
  await superdoc.waitForStable();
  await superdoc.snapshot('bold + italic applied');

  // Open color dropdown and pick red
  await superdoc.page.locator('[data-item="btn-color"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator('.option[aria-label="red"]').first().click();
  await superdoc.waitForStable();

  // Assert all toolbar states
  await expect(superdoc.page.locator('[data-item="btn-bold"]')).toHaveClass(/active/);
  await expect(superdoc.page.locator('[data-item="btn-italic"]')).toHaveClass(/active/);
  const colorBar = superdoc.page.locator('[data-item="btn-color"] .color-bar');
  await expect(colorBar).toHaveCSS('background-color', 'rgb(210, 0, 63)');
  await superdoc.snapshot('bold + italic + red color applied');

  // Assert all PM marks
  const pos = await superdoc.findTextPos('styled cell');
  await superdoc.assertMarksAtPos(pos, ['bold', 'italic']);
  await superdoc.assertMarkAttrsAtPos(pos, 'textStyle', { color: '#D2003F' });
});

test('different styles in different cells', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Type and bold in first cell
  await superdoc.type('bold cell');
  await superdoc.waitForStable();

  let pos1 = await superdoc.findTextPos('bold cell');
  await superdoc.setTextSelection(pos1, pos1 + 'bold cell'.length);
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-bold"]').click();
  await superdoc.waitForStable();
  await superdoc.snapshot('first cell bolded');

  // Tab to second cell, type and apply italic
  await superdoc.press('Tab');
  await superdoc.type('italic cell');
  await superdoc.waitForStable();

  let pos2 = await superdoc.findTextPos('italic cell');
  await superdoc.setTextSelection(pos2, pos2 + 'italic cell'.length);
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-italic"]').click();
  await superdoc.waitForStable();
  await superdoc.snapshot('second cell italicized');

  // Assert first cell is bold (not italic)
  pos1 = await superdoc.findTextPos('bold cell');
  await superdoc.assertMarksAtPos(pos1, ['bold']);
  const marks1 = await superdoc.getMarksAtPos(pos1);
  expect(marks1).not.toContain('italic');

  // Assert second cell is italic (not bold)
  pos2 = await superdoc.findTextPos('italic cell');
  await superdoc.assertMarksAtPos(pos2, ['italic']);
  const marks2 = await superdoc.getMarksAtPos(pos2);
  expect(marks2).not.toContain('bold');
});

test('font family and size in a table cell', async ({ superdoc }) => {
  await insertTableAndTypeInCell(superdoc, 'fancy text');
  await superdoc.snapshot('text selected in cell');

  // Change font family
  await superdoc.page.locator('[data-item="btn-fontFamily"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-fontFamily-option"]').filter({ hasText: 'Georgia' }).click();
  await superdoc.waitForStable();
  await superdoc.snapshot('Georgia font applied');

  // Change font size
  await superdoc.page.locator('[data-item="btn-fontSize"]').click();
  await superdoc.waitForStable();
  await superdoc.page.locator('[data-item="btn-fontSize-option"]').filter({ hasText: '24' }).click();
  await superdoc.waitForStable();

  // Assert toolbar
  await expect(superdoc.page.locator('[data-item="btn-fontFamily"] .button-label')).toHaveText('Georgia');
  await expect(superdoc.page.locator('#inlineTextInput-fontSize')).toHaveValue('24');
  await superdoc.snapshot('Georgia 24pt applied in cell');

  // Assert PM marks
  const pos = await superdoc.findTextPos('fancy text');
  await superdoc.assertMarkAttrsAtPos(pos, 'textStyle', { fontFamily: 'Georgia' });
  await superdoc.assertMarkAttrsAtPos(pos, 'textStyle', { fontSize: '24pt' });
});

test('styles survive cell navigation', async ({ superdoc }) => {
  await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
  await superdoc.waitForStable();

  // Type, select, and bold in first cell
  await superdoc.type('persist me');
  await superdoc.waitForStable();

  let pos = await superdoc.findTextPos('persist me');
  await superdoc.setTextSelection(pos, pos + 'persist me'.length);
  await superdoc.waitForStable();

  await superdoc.page.locator('[data-item="btn-bold"]').click();
  await superdoc.waitForStable();
  await superdoc.snapshot('bold applied in first cell');

  // Navigate away to second cell and back
  await superdoc.press('Tab');
  await superdoc.type('other cell');
  await superdoc.waitForStable();
  await superdoc.snapshot('navigated to second cell');

  // Navigate back (Shift+Tab)
  await superdoc.press('Shift+Tab');
  await superdoc.waitForStable();
  await superdoc.snapshot('navigated back to first cell');

  // Assert bold still present on first cell text
  pos = await superdoc.findTextPos('persist me');
  await superdoc.assertMarksAtPos(pos, ['bold']);
});
