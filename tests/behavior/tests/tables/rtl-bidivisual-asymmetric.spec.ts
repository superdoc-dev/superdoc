import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', showSelection: true } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SD-2810 Wave 3 substrate. Three Word-native fixtures targeting OOXML
// properties whose visual side flips with table direction per ECMA-376:
//   - w:tblBorders/start/end (§17.4.38, §17.4.33/12)
//   - w:tcMar/start/end (§17.4.68) - single-cell margins under w:tcPr
//   - w:gridBefore / w:gridAfter (§17.4.14, §17.4.15) - per §17.4.15:
//     "leading edge (left for LTR tables, right for RTL tables)"
//
// Each test pins a precise visual-side assertion so a regression that
// double-mirrors or skips the mirror fails here instead of silently
// producing the LTR rendering.

// ----------------------------------------------------------------------------
// tblBorders start/end asymmetric (§17.4.38 + §17.4.33/12)
// ----------------------------------------------------------------------------

test('RTL bidiVisual table with asymmetric tblBorders renders start on visual right and end on visual left', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-bidivisual-tblborders-asymmetric.docx'));
  await superdoc.waitForStable();

  // Fixture: bidiVisual + tblBorders/start=RED (#FF0000), end=BLUE (#0000FF).
  // Per §17.4.33/12 with table-direction governance, start = visual right of
  // the table, end = visual left. The painter applies these as a colored
  // border on the table fragment container (when borderCollapse='separate')
  // OR on the edge cells of the row.
  const borders = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const fragRect = fragment.getBoundingClientRect();
    const fragStyle = window.getComputedStyle(fragment as HTMLElement);

    // Find the edge cells (children of fragment, absolutely positioned).
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    if (cells.length === 0) return null;

    // Visually-rightmost cell = highest .left within fragment
    let visualRightCell: Element | null = null;
    let visualLeftCell: Element | null = null;
    let maxLeft = -Infinity;
    let minLeft = Infinity;
    for (const cell of cells) {
      const r = (cell as HTMLElement).getBoundingClientRect();
      const relLeft = r.left - fragRect.left;
      if (relLeft > maxLeft) {
        maxLeft = relLeft;
        visualRightCell = cell;
      }
      if (relLeft < minLeft) {
        minLeft = relLeft;
        visualLeftCell = cell;
      }
    }
    if (!visualRightCell || !visualLeftCell) return null;

    return {
      fragment: {
        borderLeftColor: fragStyle.borderLeftColor,
        borderRightColor: fragStyle.borderRightColor,
        borderLeftWidth: parseFloat(fragStyle.borderLeftWidth),
        borderRightWidth: parseFloat(fragStyle.borderRightWidth),
      },
      visualRightCell: {
        borderRightColor: window.getComputedStyle(visualRightCell).borderRightColor,
        borderRightWidth: parseFloat(window.getComputedStyle(visualRightCell).borderRightWidth),
      },
      visualLeftCell: {
        borderLeftColor: window.getComputedStyle(visualLeftCell).borderLeftColor,
        borderLeftWidth: parseFloat(window.getComputedStyle(visualLeftCell).borderLeftWidth),
      },
    };
  });

  expect(borders).not.toBeNull();
  if (!borders) return;

  const isRed = (c: string) => /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/.test(c);
  const isBlue = (c: string) => /rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/.test(c);

  // Either the fragment container has the outer border (separate model) OR
  // the edge cells carry it (single-owner cell model). Accept either path,
  // but assert start (RED) on visual right and end (BLUE) on visual left.
  const rightHasRed = isRed(borders.fragment.borderRightColor) || isRed(borders.visualRightCell.borderRightColor);
  const leftHasBlue = isBlue(borders.fragment.borderLeftColor) || isBlue(borders.visualLeftCell.borderLeftColor);
  expect(rightHasRed).toBe(true);
  expect(leftHasBlue).toBe(true);
});

// ----------------------------------------------------------------------------
// tcMar start/end asymmetric (§17.4.68 + cell-padding mirror)
// ----------------------------------------------------------------------------

// Regression for SD-3134: getTableCellMargins resolves cell-level
// w:tcMar/start/end against table-level defaults inside the importer
// and outputs LTR-default physical sides. convertCellMarginsToPx no
// longer pre-swaps for RTL. With those two fixes the painter is the
// single owner of the visual mirror and asymmetric tcMar renders
// Word-equivalent.
test('RTL bidiVisual cell with asymmetric tcMar renders larger start padding on visual right', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-bidivisual-tcmar-asymmetric.docx'));
  await superdoc.waitForStable();

  // Fixture: first cell tcMar/start=480 twips (large, ~24px) end=60 twips (small, ~3px).
  // tcMar (§17.4.68) start/end follow table direction (same governance as
  // tblBorders/start/end per §17.4.33/12 and the leading-edge rule in
  // §17.4.15: left for LTR tables, right for RTL tables). In a bidiVisual
  // table, start lands on visual right, so paddingRight > paddingLeft.
  const padding = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    const target = cells.find((cell) => cell.textContent?.includes('start-padding-large'));
    if (!target) return null;
    const cs = window.getComputedStyle(target);
    return {
      paddingLeft: parseFloat(cs.paddingLeft),
      paddingRight: parseFloat(cs.paddingRight),
    };
  });

  expect(padding).not.toBeNull();
  if (!padding) return;

  // Larger padding should be on the visual right (where start renders in RTL).
  expect(padding.paddingRight).toBeGreaterThan(padding.paddingLeft);
  // And the difference should be substantial (~21px between 480 twips and 60 twips).
  expect(padding.paddingRight - padding.paddingLeft).toBeGreaterThan(10);
});

// ----------------------------------------------------------------------------
// tcMar overrides table-level cellMargins per §17.4.68
// ----------------------------------------------------------------------------

// Regression for SD-3134 round-2: when a table has tblCellMar with physical
// left/right defaults AND a cell has inline tcMar with logical start/end,
// the cell-level exception must override the table-level default per
// §17.4.68 ("This setting, if present, shall override the table cell margins
// from the table-level cell margins"). Earlier the importer kept both shapes
// in cellMargins and extractCellPadding gave physical left/right precedence,
// so the inline start/end values were silently dropped.
test('LTR table with table-level marginLeft/Right defaults + cell-level tcMar/start/end uses the cell-level values', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/ltr-tcmar-overrides-table-default.docx'));
  await superdoc.waitForStable();

  // Fixture:
  //  - Table tblPr/tblCellMar w:left=40 dxa and w:right=40 dxa (~2.7px each)
  //  - Cell 1 tcPr/tcMar w:start=480 dxa (~32px) and w:end=60 dxa (~4px)
  //  - Cell 2 has no inline tcMar (inherits the table defaults)
  const padding = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    const exception = cells.find((c) => c.textContent?.includes('inline tcMar exception cell'));
    const defaulted = cells.find((c) => c.textContent?.includes('table default cell'));
    if (!exception || !defaulted) return null;
    const csE = window.getComputedStyle(exception);
    const csD = window.getComputedStyle(defaulted);
    return {
      exception: { paddingLeft: parseFloat(csE.paddingLeft), paddingRight: parseFloat(csE.paddingRight) },
      defaulted: { paddingLeft: parseFloat(csD.paddingLeft), paddingRight: parseFloat(csD.paddingRight) },
    };
  });

  expect(padding).not.toBeNull();
  if (!padding) return;

  // Cell with inline tcMar uses its own asymmetric exception values.
  expect(padding.exception.paddingLeft).toBeGreaterThan(20);
  expect(padding.exception.paddingRight).toBeLessThan(10);
  expect(padding.exception.paddingLeft - padding.exception.paddingRight).toBeGreaterThan(20);
  // Cell without inline tcMar inherits the table-level defaults (~2.7px).
  expect(padding.defaulted.paddingLeft).toBeLessThan(5);
  expect(padding.defaulted.paddingRight).toBeLessThan(5);
});

// ----------------------------------------------------------------------------
// gridBefore / gridAfter (§17.4.14 + §17.4.15)
// ----------------------------------------------------------------------------

test('RTL bidiVisual table with gridBefore places the gap on the visual right of the row', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-bidivisual-gridbefore-gridafter.docx'));
  await superdoc.waitForStable();

  // Fixture: row 2 has w:gridBefore w:val="1" with 2 cells. Per §17.4.15
  // ("leading edge ... right for RTL tables"), the skipped grid unit
  // should appear on the visually-rightmost side of row 2. Row 1 (full
  // 3 cells) extends to the visual right; row 2's rightmost cell sits
  // one column inward from row 1's rightmost.
  const geometry = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const fragRect = fragment.getBoundingClientRect();
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');

    // Row 1 cells: contain R1C1, R1C2, R1C3
    // Row 2 cells: contain R2C1, R2C2 (only 2 cells; gridBefore=1)
    const row1RightCell = cells.find((c) => c.textContent?.includes('R1C1'));
    const row2RightCell = cells.find((c) => c.textContent?.includes('R2C1'));
    if (!row1RightCell || !row2RightCell) return null;

    const r1 = (row1RightCell as HTMLElement).getBoundingClientRect();
    const r2 = (row2RightCell as HTMLElement).getBoundingClientRect();
    return {
      row1RightEdge: r1.right - fragRect.left,
      row2RightEdge: r2.right - fragRect.left,
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;

  // Row 2's rightmost cell ends BEFORE row 1's rightmost cell does, because
  // gridBefore=1 leaves a visually-right gap. The exact magnitude depends
  // on the column width, but row2RightEdge < row1RightEdge.
  expect(geometry.row2RightEdge).toBeLessThan(geometry.row1RightEdge);
});

test('RTL bidiVisual table with gridAfter places the gap on the visual left of the row', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-bidivisual-gridbefore-gridafter.docx'));
  await superdoc.waitForStable();

  // Fixture: row 3 has w:gridAfter w:val="1" with 2 cells. Per §17.4.14
  // (the trailing edge), the skipped grid unit appears on the visually-
  // leftmost side of row 3 in RTL. Row 3's leftmost cell ends inside the
  // table rather than at the table's visual-left edge.
  const geometry = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const fragRect = fragment.getBoundingClientRect();
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    const row1LeftCell = cells.find((c) => c.textContent?.includes('R1C3'));
    const row3LeftCell = cells.find((c) => c.textContent?.includes('R3C2'));
    if (!row1LeftCell || !row3LeftCell) return null;
    const r1 = (row1LeftCell as HTMLElement).getBoundingClientRect();
    const r3 = (row3LeftCell as HTMLElement).getBoundingClientRect();
    return {
      row1LeftEdge: r1.left - fragRect.left,
      row3LeftEdge: r3.left - fragRect.left,
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;

  // Row 3's leftmost rendered cell sits to the right of row 1's leftmost
  // rendered cell because gridAfter=1 leaves a visually-left gap.
  expect(geometry.row3LeftEdge).toBeGreaterThan(geometry.row1LeftEdge);
});
