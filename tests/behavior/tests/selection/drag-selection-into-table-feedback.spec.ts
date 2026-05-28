import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * SD-2676: Table selection must give live feedback while dragging.
 *
 * Regression history: PR #2205 (SD-2024) clamped the drag `head` to the table
 * boundary whenever the pointer resolved inside an isolating node. That froze
 * the selection highlight while the pointer swept through table rows — the
 * highlight only resumed once the pointer left the table. SD-2676 removed the
 * clamp so the head follows the pointer position continuously.
 *
 * These behavior tests drive a real pointer drag (the bug is a UI drag
 * interaction) and assert the selection keeps growing — and the highlight keeps
 * being painted — while the pointer remains inside the table. The pre-fix bug
 * would surface as the selection size plateauing at the table boundary.
 */

const ROWS = 4;
const COLS = 2;

/** Count visible selection overlay rects (the painted highlight). */
async function getSelectionOverlayRectCount(superdoc: SuperDocFixture): Promise<number> {
  return superdoc.page.evaluate(() => {
    const overlay = document.querySelector('.presentation-editor__selection-layer--local');
    if (!overlay) return 0;
    let count = 0;
    for (const child of overlay.children) {
      const rect = child.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) count++;
    }
    return count;
  });
}

/**
 * The committed selection's span and the document text it covers.
 *
 * `text` joins every selection range, not just `from`..`to`: a CellSelection's
 * `from`/`to` span only the head cell, while the selected cells live in
 * `.ranges`. Joining the ranges yields the full selected content for both a
 * TextSelection (one range = the whole span) and a CellSelection (one range per
 * selected cell).
 */
async function getSelectionInfo(
  superdoc: SuperDocFixture,
): Promise<{ type: string; from: number; to: number; head: number; text: string }> {
  return superdoc.page.evaluate(() => {
    const { state } = (window as any).editor;
    const s = state.selection;
    const text = s.ranges
      .map((r: { $from: { pos: number }; $to: { pos: number } }) =>
        state.doc.textBetween(r.$from.pos, r.$to.pos, ' ', ' '),
      )
      .join(' ');
    return { type: s.constructor.name, from: s.from, to: s.to, head: s.head, text };
  });
}

/** Label used for the cell at (row, col), 1-indexed. */
function cellLabel(row: number, col: number): string {
  return `R${row}C${col} content`;
}

/**
 * Paragraph above + a fully populated multi-row table. Every cell carries text
 * so each row has real line geometry to resolve a pointer hit against.
 */
async function setupParagraphAboveAndPopulatedTable(superdoc: SuperDocFixture) {
  await superdoc.type('Paragraph above the table');
  await superdoc.newLine();
  await superdoc.waitForStable();

  await superdoc.executeCommand('insertTable', { rows: ROWS, cols: COLS, withHeaderRow: false });
  await superdoc.waitForStable();

  // Cursor lands in the first cell after insertTable. Tab navigates forward;
  // Tab on the LAST cell would add a new row, so stop before the final Tab.
  const totalCells = ROWS * COLS;
  for (let i = 0; i < totalCells; i++) {
    const row = Math.floor(i / COLS) + 1;
    const col = (i % COLS) + 1;
    await superdoc.type(cellLabel(row, col));
    if (i < totalCells - 1) await superdoc.press('Tab');
  }
  await superdoc.waitForStable();

  await superdoc.assertTableExists(ROWS, COLS);
}

interface DragSample {
  x: number;
  y: number;
  size: number;
  rects: number;
}

/** Press at (startX, startY), sweep to (endX, endY) in `steps`, sampling state. */
async function dragSampling(
  superdoc: SuperDocFixture,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number,
): Promise<DragSample[]> {
  const samples: DragSample[] = [];
  await superdoc.page.mouse.move(startX, startY);
  await superdoc.page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const x = startX + ((endX - startX) * i) / steps;
    const y = startY + ((endY - startY) * i) / steps;
    await superdoc.page.mouse.move(x, y);
    // Let the layout/paint pipeline catch up so each sample reflects the move.
    await superdoc.page.waitForTimeout(40);
    const sel = await superdoc.getSelection();
    const rects = await getSelectionOverlayRectCount(superdoc);
    samples.push({ x, y, size: sel.to - sel.from, rects });
  }
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();
  return samples;
}

test.describe('drag selection live feedback in tables (SD-2676)', () => {
  test('dragging from above down through table rows keeps the highlight updating', async ({ superdoc }) => {
    await setupParagraphAboveAndPopulatedTable(superdoc);

    const paragraphLine = superdoc.page
      .locator('.superdoc-line')
      .filter({ hasText: 'Paragraph above the table' })
      .first();
    const paragraphBox = await paragraphLine.boundingBox();
    if (!paragraphBox) throw new Error('Paragraph line not visible');

    const tableFragment = superdoc.page.locator('.superdoc-table-fragment').first();
    const tableBox = await tableFragment.boundingBox();
    if (!tableBox) throw new Error('Table fragment not visible');

    // End the drag squarely on the LAST row's first-column text. Aiming at a
    // real cell line (not the table's horizontal/vertical seams) is essential:
    // a resting point over a column gap or row border resolves to the table
    // boundary and the head snaps back out of the table. The sweep stays in the
    // left column the whole way down, so the pointer is always over cell text.
    const lastRowCell = superdoc.page
      .locator('.superdoc-line')
      .filter({ hasText: cellLabel(ROWS, 1) })
      .first();
    const lastRowCellBox = await lastRowCell.boundingBox();
    if (!lastRowCellBox) throw new Error('Last-row cell line not visible');

    const startX = paragraphBox.x + 20;
    const startY = paragraphBox.y + paragraphBox.height / 2;
    const endX = lastRowCellBox.x + lastRowCellBox.width / 2;
    const endY = lastRowCellBox.y + lastRowCellBox.height / 2;

    const samples = await dragSampling(superdoc, startX, startY, endX, endY, 12);

    // Samples taken while the pointer is within the table's vertical span.
    const inTable = samples.filter((s) => s.y >= tableBox.y);
    expect(inTable.length).toBeGreaterThan(2);

    // Live-feedback guard: this drag stays a TextSelection (the anchor is
    // outside the table), so its size must keep changing while the pointer
    // sweeps through rows — not freeze at the boundary. The pre-fix bug pinned
    // the head to the table boundary, collapsing every in-table sample to one
    // size. More than one distinct in-table size proves the highlight updated.
    const inTableSizes = inTable.map((s) => s.size);
    expect(new Set(inTableSizes).size).toBeGreaterThan(1);

    // The painted highlight must be present whenever there is a selection.
    for (const s of samples) {
      if (s.size > 0) expect(s.rects).toBeGreaterThan(0);
    }

    // End-state guard (the part that matters to the user): once the pointer
    // comes to rest inside the table and the button is released, the committed
    // selection must actually reach into the table — spanning from the
    // paragraph through the cells the pointer crossed, down to the last row.
    // Pre-fix, the head was clamped to the boundary and this collapsed back to
    // the paragraph alone.
    const finalSel = await getSelectionInfo(superdoc);
    expect(finalSel.text).toContain(cellLabel(1, 1)); // reached the first row
    expect(finalSel.text).toContain(cellLabel(ROWS, 1)); // through to the last row
    expect(finalSel.to - finalSel.from).toBeGreaterThan(0);
    expect(await getSelectionOverlayRectCount(superdoc)).toBeGreaterThan(0);
  });

  test('dragging downward starting inside the table selects cell content', async ({ superdoc }) => {
    await setupParagraphAboveAndPopulatedTable(superdoc);

    const topCell = superdoc.page
      .locator('.superdoc-line')
      .filter({ hasText: cellLabel(1, 1) })
      .first();
    const bottomCell = superdoc.page
      .locator('.superdoc-line')
      .filter({ hasText: cellLabel(ROWS, 1) })
      .first();
    const topBox = await topCell.boundingBox();
    const bottomBox = await bottomCell.boundingBox();
    if (!topBox || !bottomBox) throw new Error('Table cell lines not visible');

    const startX = topBox.x + 6;
    const startY = topBox.y + topBox.height / 2;
    const endX = bottomBox.x + 6;
    const endY = bottomBox.y + bottomBox.height / 2;

    const samples = await dragSampling(superdoc, startX, startY, endX, endY, 10);

    // Dragging from inside the table must actually produce a selection that
    // spans the rows the pointer crossed — the second symptom in SD-2676 was
    // that no text got selected at all.
    const finalSel = await getSelectionInfo(superdoc);
    expect(finalSel.to - finalSel.from).toBeGreaterThan(0);
    expect(finalSel.text).toContain(cellLabel(1, 1));
    expect(finalSel.text).toContain(cellLabel(ROWS, 1));
    expect(await getSelectionOverlayRectCount(superdoc)).toBeGreaterThan(0);

    // A same-table drag resolves to a CellSelection, whose paint expands across
    // rows as the pointer descends. The painted rect count is the faithful
    // signal that the highlight keeps updating (the CellSelection from/to span
    // stays constant). Locks in the bug report's second symptom — dragging from
    // inside the table must select content — against future regressions.
    const activeRects = samples.filter((s) => s.size > 0).map((s) => s.rects);
    expect(new Set(activeRects).size).toBeGreaterThan(1);
  });

  test('dragging upward starting inside the table selects cell content', async ({ superdoc }) => {
    await setupParagraphAboveAndPopulatedTable(superdoc);

    const topCell = superdoc.page
      .locator('.superdoc-line')
      .filter({ hasText: cellLabel(1, 1) })
      .first();
    const bottomCell = superdoc.page
      .locator('.superdoc-line')
      .filter({ hasText: cellLabel(ROWS, 1) })
      .first();
    const topBox = await topCell.boundingBox();
    const bottomBox = await bottomCell.boundingBox();
    if (!topBox || !bottomBox) throw new Error('Table cell lines not visible');

    // Start in the bottom row, drag up to the top row.
    const startX = bottomBox.x + 6;
    const startY = bottomBox.y + bottomBox.height / 2;
    const endX = topBox.x + 6;
    const endY = topBox.y + topBox.height / 2;

    const samples = await dragSampling(superdoc, startX, startY, endX, endY, 10);

    const finalSel = await getSelectionInfo(superdoc);
    expect(finalSel.to - finalSel.from).toBeGreaterThan(0);
    expect(finalSel.text).toContain(cellLabel(1, 1));
    expect(finalSel.text).toContain(cellLabel(ROWS, 1));
    expect(await getSelectionOverlayRectCount(superdoc)).toBeGreaterThan(0);

    // The highlight expands across rows as the pointer ascends.
    const activeRects = samples.filter((s) => s.size > 0).map((s) => s.rects);
    expect(new Set(activeRects).size).toBeGreaterThan(1);
  });
});
