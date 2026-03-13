import { test, expect } from '../../fixtures/superdoc.js';

// Start in editing mode (fixture needs contenteditable="true" for setup),
// then switch to viewing mode inside each test.
test.use({
  config: {
    showSelection: true,
    showCaret: true,
    allowSelectionInViewMode: true,
  },
});

/** Type initial content in editing mode, then switch to viewing mode. */
async function setupViewingMode(superdoc: Parameters<Parameters<typeof test>[1]>[0]['superdoc']) {
  await superdoc.type('The quick brown fox jumps over the lazy dog');
  await superdoc.waitForStable();

  await superdoc.setDocumentMode('viewing');
  await superdoc.waitForStable();
  await superdoc.assertDocumentMode('viewing');
}

test.describe('Selection in viewing mode with allowSelectionInViewMode', () => {
  test('@behavior SD-1695: can place cursor with mouse click', async ({ superdoc }) => {
    await setupViewingMode(superdoc);

    await superdoc.clickOnLine(0, 20);
    await superdoc.waitForStable();

    const sel = await superdoc.getSelection();
    expect(sel.from).toBeGreaterThanOrEqual(0);
  });

  // Note: Shift+Arrow selection extending does not work in PresentationEditor mode
  // because view.editable is false and PM's editHandlers.keydown doesn't run.
  // The keyboard allowlist in editable.js only applies in plain Editor mode.
  // Mouse-based selection (click + drag, double-click, triple-click) works.

  test('@behavior SD-1695: typing is blocked', async ({ superdoc }) => {
    await setupViewingMode(superdoc);

    const before = await superdoc.getTextContent();

    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    await superdoc.page.keyboard.type('INJECTED');
    await superdoc.waitForStable();

    const after = await superdoc.getTextContent();
    expect(after).toBe(before);
  });

  test('@behavior SD-1695: Backspace and Delete are blocked', async ({ superdoc }) => {
    await setupViewingMode(superdoc);

    const before = await superdoc.getTextContent();

    await superdoc.clickOnLine(0, 10);
    await superdoc.waitForStable();

    await superdoc.press('Backspace');
    await superdoc.press('Delete');
    await superdoc.waitForStable();

    const after = await superdoc.getTextContent();
    expect(after).toBe(before);
  });

  test('@behavior SD-1695: triple-click selects line', async ({ superdoc }) => {
    await setupViewingMode(superdoc);

    await superdoc.tripleClickLine(0);
    await superdoc.waitForStable();

    const sel = await superdoc.getSelection();
    expect(sel.to).toBeGreaterThan(sel.from);
  });
});

test.describe('Selection blocked in viewing mode without allowSelectionInViewMode', () => {
  // Override: no allowSelectionInViewMode
  test.use({
    config: {
      showSelection: true,
    },
  });

  test('@behavior SD-1695: selection is cleared in viewing mode without flag', async ({ superdoc }) => {
    await superdoc.type('Some text to test');
    await superdoc.waitForStable();

    await superdoc.setDocumentMode('viewing');
    await superdoc.waitForStable();

    await superdoc.clickOnLine(0, 20);
    await superdoc.waitForStable();

    const sel = await superdoc.getSelection();
    expect(sel.from).toBe(sel.to);
  });
});
