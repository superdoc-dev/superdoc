import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Helper: type text with mixed formatting so adjacent runs have different marks.
 * Produces "NormalBoldItalic" where each word has distinct formatting.
 */
async function setupMixedFormattingText(superdoc: SuperDocFixture) {
  await superdoc.type('Normal');
  await superdoc.waitForStable();

  await superdoc.bold();
  await superdoc.type('Bold');
  await superdoc.bold(); // toggle off
  await superdoc.waitForStable();

  await superdoc.italic();
  await superdoc.type('Italic');
  await superdoc.italic(); // toggle off
  await superdoc.waitForStable();
}

/**
 * Helper: count visible selection overlay rects.
 */
async function getSelectionOverlayRectCount(superdoc: SuperDocFixture): Promise<number> {
  return superdoc.page.evaluate(() => {
    const overlay = document.querySelector('.presentation-editor__selection-layer--local');
    if (!overlay) return 0;
    // Count children with non-zero dimensions (actual selection rects)
    let count = 0;
    for (const child of overlay.children) {
      const rect = child.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) count++;
    }
    return count;
  });
}

// ---------------------------------------------------------------------------
// Selection across mark boundaries
// ---------------------------------------------------------------------------

test.describe('selection across mark boundaries (SD-2024)', () => {
  test('selecting text that spans bold and italic runs shows a continuous highlight', async ({ superdoc }) => {
    await setupMixedFormattingText(superdoc);

    // Select from "Normal" through "Bold" to "Italic" — crosses two mark boundaries
    const startPos = await superdoc.findTextPos('Normal');
    const endText = 'Italic';
    const endPos = await superdoc.findTextPos(endText);
    await superdoc.setTextSelection(startPos, endPos + endText.length);
    await superdoc.waitForStable();

    // The selection overlay must have visible rects covering the selected text
    const rectCount = await getSelectionOverlayRectCount(superdoc);
    expect(rectCount).toBeGreaterThan(0);

    // PM selection should span the full range
    const sel = await superdoc.getSelection();
    expect(sel.to - sel.from).toBeGreaterThan(0);
  });

  test('selecting exactly at a mark boundary produces a visible highlight', async ({ superdoc }) => {
    await setupMixedFormattingText(superdoc);

    // Select just the boundary between "Bold" and "Italic"
    // "NormalBoldItalic" — place selection from end of "Bold" into start of "Italic"
    const boldPos = await superdoc.findTextPos('Bold');
    const italicPos = await superdoc.findTextPos('Italic');
    await superdoc.setTextSelection(boldPos + 2, italicPos + 2);
    await superdoc.waitForStable();

    const rectCount = await getSelectionOverlayRectCount(superdoc);
    expect(rectCount).toBeGreaterThan(0);

    const sel = await superdoc.getSelection();
    expect(sel.to - sel.from).toBeGreaterThan(0);
  });

  test('drag-selecting across bold and normal text maintains selection overlay', async ({ superdoc }) => {
    await setupMixedFormattingText(superdoc);
    await superdoc.waitForStable();

    // Find the line element to compute drag coordinates
    const line = superdoc.page.locator('.superdoc-line').first();
    const box = await line.boundingBox();
    if (!box) throw new Error('Line not visible');

    // Drag from left side (Normal text) to right side (Italic text)
    const startX = box.x + 10;
    const endX = box.x + box.width - 10;
    const y = box.y + box.height / 2;

    await superdoc.page.mouse.move(startX, y);
    await superdoc.page.mouse.down();
    // Move in steps to simulate a real drag
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const x = startX + ((endX - startX) * i) / steps;
      await superdoc.page.mouse.move(x, y);
    }
    await superdoc.page.mouse.up();
    await superdoc.waitForStable();

    // After drag, we should have a non-collapsed selection with visible overlay
    const sel = await superdoc.getSelection();
    expect(sel.to - sel.from).toBeGreaterThan(0);

    const rectCount = await getSelectionOverlayRectCount(superdoc);
    expect(rectCount).toBeGreaterThan(0);
  });

  test('drag across marks never drops selection overlay mid-drag', async ({ superdoc }) => {
    await setupMixedFormattingText(superdoc);
    await superdoc.waitForStable();

    const line = superdoc.page.locator('.superdoc-line').first();
    const box = await line.boundingBox();
    if (!box) throw new Error('Line not visible');

    const startX = box.x + 10;
    const endX = box.x + box.width - 10;
    const y = box.y + box.height / 2;

    await superdoc.page.mouse.move(startX, y);
    await superdoc.page.mouse.down();

    // Drag across the line in small increments, sampling overlay at each step
    let minRects = Infinity;
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const x = startX + ((endX - startX) * i) / steps;
      await superdoc.page.mouse.move(x, y);
      // Small wait to let the rendering pipeline catch up
      await superdoc.page.waitForTimeout(50);

      const sel = await superdoc.getSelection();
      if (sel.to - sel.from > 0) {
        const rects = await getSelectionOverlayRectCount(superdoc);
        minRects = Math.min(minRects, rects);
      }
    }

    await superdoc.page.mouse.up();
    await superdoc.waitForStable();

    // At no point during the drag should the overlay have dropped to zero rects
    // when there was a non-collapsed selection
    expect(minRects).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Drag selection near tables (isolating node clamping)
// ---------------------------------------------------------------------------

test.describe('drag selection near tables (SD-2024)', () => {
  async function setupParagraphAndTable(superdoc: SuperDocFixture) {
    await superdoc.type('Text before table');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();
  }

  test('drag from paragraph into table clamps selection at table boundary', async ({ superdoc }) => {
    await setupParagraphAndTable(superdoc);

    // Click into the first paragraph to establish anchor
    const textPos = await superdoc.findTextPos('Text before table');
    await superdoc.setTextSelection(textPos + 5); // cursor in "before"
    await superdoc.waitForStable();

    // Get coordinates for the paragraph and the table area
    const firstLine = superdoc.page.locator('.superdoc-line').first();
    const firstLineBox = await firstLine.boundingBox();
    if (!firstLineBox) throw new Error('First line not visible');

    // Find the table fragment in the rendered DOM
    const tableFragment = superdoc.page.locator('.superdoc-table-fragment').first();
    const tableBox = await tableFragment.boundingBox();
    if (!tableBox) throw new Error('Table not visible');

    // Drag from the paragraph down into the table
    const startX = firstLineBox.x + 50;
    const startY = firstLineBox.y + firstLineBox.height / 2;
    const endX = tableBox.x + tableBox.width / 2;
    const endY = tableBox.y + tableBox.height / 2;

    await superdoc.page.mouse.move(startX, startY);
    await superdoc.page.mouse.down();
    await superdoc.page.mouse.move(endX, endY, { steps: 5 });
    await superdoc.page.mouse.up();
    await superdoc.waitForStable();

    // The selection should NOT be a CellSelection (which would mean it jumped inside).
    // It should be a TextSelection with the head clamped at the table boundary.
    const selType = await superdoc.page.evaluate(() => {
      const { state } = (window as any).editor;
      return state.selection.constructor.name ?? state.selection.toJSON().type;
    });
    expect(selType).not.toBe('CellSelection');

    // The selection should be non-collapsed (we dragged across text)
    const sel = await superdoc.getSelection();
    expect(sel.to - sel.from).toBeGreaterThan(0);
  });

  test('selection starting in paragraph and ending past table is allowed', async ({ superdoc }) => {
    // Setup: paragraph, table, then another paragraph after the table
    await superdoc.type('Text before table');
    await superdoc.newLine();
    await superdoc.waitForStable();

    await superdoc.executeCommand('insertTable', { rows: 2, cols: 2, withHeaderRow: false });
    await superdoc.waitForStable();

    // Navigate past the table and type text after it
    // Tab through all 4 cells to get past the table
    await superdoc.press('Tab');
    await superdoc.press('Tab');
    await superdoc.press('Tab');
    await superdoc.press('Tab'); // exits table, creates/moves to paragraph after
    await superdoc.waitForStable();

    await superdoc.type('Text after table');
    await superdoc.waitForStable();

    // Select from before the table to after it using PM positions
    const beforePos = await superdoc.findTextPos('Text before table');
    const afterPos = await superdoc.findTextPos('Text after table');
    await superdoc.setTextSelection(beforePos, afterPos + 'Text after table'.length);
    await superdoc.waitForStable();

    // This wide selection spanning the table should be valid
    const sel = await superdoc.getSelection();
    expect(sel.to - sel.from).toBeGreaterThan(0);

    const rectCount = await getSelectionOverlayRectCount(superdoc);
    expect(rectCount).toBeGreaterThan(0);
  });
});
