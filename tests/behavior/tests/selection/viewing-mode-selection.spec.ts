import { test, expect } from '../../fixtures/superdoc.js';

test.describe('Selection in viewing mode with allowSelectionInViewMode', () => {
  test.use({
    config: {
      showSelection: true,
      showCaret: true,
      allowSelectionInViewMode: true,
      documentMode: 'viewing',
    },
  });

  test('@behavior SD-1695: can select text with mouse click and keyboard navigation', async ({ superdoc }) => {
    await superdoc.waitForStable();
    await superdoc.assertDocumentMode('viewing');

    // Click to position cursor on the first line
    await superdoc.clickOnLine(0, 20);
    await superdoc.waitForStable();

    // Selection should exist (cursor placed)
    const sel = await superdoc.getSelection();
    expect(sel.from).toBeGreaterThanOrEqual(0);

    // Navigate with arrow keys
    await superdoc.press('ArrowRight');
    await superdoc.waitForStable();

    const sel2 = await superdoc.getSelection();
    expect(sel2.from).toBeGreaterThanOrEqual(sel.from);
  });

  test('@behavior SD-1695: can extend selection with Shift+Arrow', async ({ superdoc }) => {
    await superdoc.waitForStable();

    // Place cursor
    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    // Extend selection with Shift+ArrowRight
    await superdoc.press('Shift+ArrowRight');
    await superdoc.press('Shift+ArrowRight');
    await superdoc.press('Shift+ArrowRight');
    await superdoc.waitForStable();

    // Selection should be a range (from != to)
    const sel = await superdoc.getSelection();
    expect(sel.to).toBeGreaterThan(sel.from);
  });

  test('@behavior SD-1695: typing is blocked in viewing mode with selection enabled', async ({ superdoc }) => {
    await superdoc.waitForStable();

    const before = await superdoc.getTextContent();

    // Click to focus
    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    // Try to type — should be blocked
    await superdoc.page.keyboard.type('INJECTED');
    await superdoc.waitForStable();

    const after = await superdoc.getTextContent();
    expect(after).toBe(before);
  });

  test('@behavior SD-1695: paste is blocked in viewing mode with selection enabled', async ({ superdoc }) => {
    await superdoc.waitForStable();

    const before = await superdoc.getTextContent();

    // Click to focus
    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    // Try to paste
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await superdoc.page.keyboard.press(`${modifier}+v`);
    await superdoc.waitForStable();

    const after = await superdoc.getTextContent();
    expect(after).toBe(before);
  });

  test('@behavior SD-1695: Backspace and Delete are blocked', async ({ superdoc }) => {
    await superdoc.waitForStable();

    const before = await superdoc.getTextContent();

    // Click to focus and select some text
    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    await superdoc.press('Backspace');
    await superdoc.press('Delete');
    await superdoc.waitForStable();

    const after = await superdoc.getTextContent();
    expect(after).toBe(before);
  });

  test('@behavior SD-1695: Select All works with Cmd/Ctrl+A', async ({ superdoc }) => {
    await superdoc.waitForStable();

    // Click to focus
    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    // Select all
    await superdoc.selectAll();
    await superdoc.waitForStable();

    // Selection should span the document
    const sel = await superdoc.getSelection();
    expect(sel.to - sel.from).toBeGreaterThan(0);
  });
});

test.describe('Selection blocked in viewing mode without allowSelectionInViewMode', () => {
  test.use({
    config: {
      showSelection: true,
      documentMode: 'viewing',
      // allowSelectionInViewMode is NOT set (defaults to false)
    },
  });

  test('@behavior SD-1695: selection is cleared in viewing mode without flag', async ({ superdoc }) => {
    await superdoc.waitForStable();
    await superdoc.assertDocumentMode('viewing');

    // Try to click — selection should be reset
    await superdoc.clickOnLine(0, 20);
    await superdoc.waitForStable();

    // Selection should be collapsed/empty (cursor at 0 or reset)
    const sel = await superdoc.getSelection();
    expect(sel.from).toBe(sel.to);
  });
});
