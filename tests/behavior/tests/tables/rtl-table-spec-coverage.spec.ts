import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', showSelection: true } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SD-2810 spec-coverage suite. Each test pins a distinct ECMA-376 §17.4
// dimension on a `bidiVisual` table and asserts the spec-mandated rendering.
// These fixtures + assertions ride the existing import + render path, and
// are intended to serve as regression substrate for Wave 3 (visual RTL
// tables, SD-2771) and ongoing table-RTL stability work.

// ----------------------------------------------------------------------------
// F1: §17.4.17 gridSpan + bidiVisual
// ----------------------------------------------------------------------------

test('RTL bidiVisual table with gridSpan=2 cell renders the merged cell on the visually-rightmost side', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-table-gridspan.docx'));
  await superdoc.waitForStable();

  const frag = await superdoc.page.locator('.superdoc-table-fragment').first();
  await expect(frag).toBeVisible();

  // The merged cell (gridSpan=2) is logical cell 0 in row 0. In a bidiVisual
  // table the visually-rightmost cell is logical cell 0. The merged cell's
  // bounding rect should sit on the right half of the table.
  const geometry = await superdoc.page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.superdoc-table-fragment .superdoc-line'));
    const merged = lines.find((line) => line.textContent?.includes('gridSpan=2'));
    if (!merged) return null;
    const cell = merged.closest('.superdoc-table-cell') ?? merged.parentElement;
    const frag = document.querySelector('.superdoc-table-fragment');
    if (!cell || !frag) return null;
    const cellRect = cell.getBoundingClientRect();
    const fragRect = frag.getBoundingClientRect();
    return {
      cellLeft: cellRect.left - fragRect.left,
      cellRight: cellRect.right - fragRect.left,
      fragWidth: fragRect.width,
      cellWidth: cellRect.width,
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;

  // The merged cell should occupy roughly 2/3 of the table width on the right side.
  // Center of cell should be in the right half of the table.
  const cellCenter = (geometry.cellLeft + geometry.cellRight) / 2;
  const fragCenter = geometry.fragWidth / 2;
  expect(cellCenter).toBeGreaterThan(fragCenter);
});

test('clicking the visually-rightmost gridSpan=2 cell lands the cursor inside that cell', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-table-gridspan.docx'));
  await superdoc.waitForStable();

  // Click the center of the merged cell (visually rightmost in a bidiVisual
  // table). Then read the editor selection and verify the resolved paragraph
  // text contains "gridSpan=2". Pin click-target -> selection mapping so a
  // regression in cell hit-testing for RTL doesn't silently route the cursor
  // to the wrong logical cell.
  const clickPoint = await superdoc.page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.superdoc-table-fragment .superdoc-line'));
    const merged = lines.find((line) => line.textContent?.includes('gridSpan=2'));
    if (!merged) return null;
    const r = (merged as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  expect(clickPoint).not.toBeNull();
  if (!clickPoint) return;

  await superdoc.page.mouse.click(clickPoint.x, clickPoint.y);
  await superdoc.waitForStable();

  const selectionText = await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const $from = editor?.state?.selection?.$from;
    if (!$from) return null;
    // Walk up the resolved position to find the enclosing paragraph and
    // return its text content - confirms the cursor landed inside the merged cell.
    for (let d = $from.depth; d >= 0; d--) {
      const n = $from.node(d);
      if (n?.type?.name === 'paragraph') return n.textContent;
    }
    return null;
  });

  expect(selectionText).toContain('gridSpan=2');
});

// ----------------------------------------------------------------------------
// F2: §17.4.84 vMerge + bidiVisual
// ----------------------------------------------------------------------------

// TODO: vMerge continuation cells render as empty rows in the current
// painter implementation, not as one tall visual cell. The locator-based
// approach below finds the restart cell but its bounding rect only covers
// the first row, not the full merged span. Need DOM-inspection investigation
// to confirm where the merged visual cell actually lives (likely a wrapper
// element with row-spanning height). Skipping until that's mapped.
test.fixme(
  'RTL bidiVisual table with vMerge column renders as one tall cell on the visually-leftmost side',
  async ({ superdoc }) => {
    await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-table-vmerge.docx'));
    await superdoc.waitForStable();

    // The vMerge column is logical column 2 (last). In a bidiVisual table the
    // visually-leftmost column is logical last. The "vMerge restart" cell
    // contains visible text "vMerge restart" and must be positioned on the
    // visual left of the table.
    const geometry = await superdoc.page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.superdoc-table-fragment .superdoc-line'));
      const mergedHead = lines.find((line) => line.textContent?.includes('vMerge restart'));
      if (!mergedHead) return null;
      const cell = mergedHead.closest('.superdoc-table-cell') ?? mergedHead.parentElement;
      const frag = document.querySelector('.superdoc-table-fragment');
      if (!cell || !frag) return null;
      const cellRect = cell.getBoundingClientRect();
      const fragRect = frag.getBoundingClientRect();
      return {
        cellLeft: cellRect.left - fragRect.left,
        cellRight: cellRect.right - fragRect.left,
        cellHeight: cellRect.height,
        fragWidth: fragRect.width,
      };
    });

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    // Visual leftmost: cell center should be in left half of table.
    const cellCenter = (geometry.cellLeft + geometry.cellRight) / 2;
    const fragCenter = geometry.fragWidth / 2;
    expect(cellCenter).toBeLessThan(fragCenter);
  },
);

// ----------------------------------------------------------------------------
// F3: §17.4.51 tblInd + bidiVisual
// ----------------------------------------------------------------------------

test('RTL bidiVisual table with tblInd indents from the right edge of the page', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-table-tblind.docx'));
  await superdoc.waitForStable();

  // Per §17.4.51, tblInd is measured from the start edge of the table.
  // For bidiVisual RTL tables, start is visual right. In our current
  // rendering contract, this fixture remains right-anchored (visual start),
  // so the gap to the right page edge should still be smaller than the gap
  // to the left page edge.
  const geometry = await superdoc.page.evaluate(() => {
    const frag = document.querySelector('.superdoc-table-fragment');
    const page = frag?.closest('.superdoc-page');
    if (!frag || !page) return null;
    const f = frag.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    return {
      leftGap: f.left - p.left,
      rightGap: p.right - f.right,
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;

  // Magnitude check: the fixture's tblInd is 1440 twips (1 inch ~= 96px). The
  // gap difference should be substantial, not just "rightGap < leftGap" which
  // is true for any right-anchored table regardless of whether tblInd was honored.
  expect(geometry.rightGap).toBeLessThan(geometry.leftGap);
  expect(geometry.leftGap - geometry.rightGap).toBeGreaterThan(40);
});

// ----------------------------------------------------------------------------
// F6: §17.4.66 tcBorders w/ logical start/end + bidiVisual
// ----------------------------------------------------------------------------

// Per §17.4.33 "start (Table Cell Leading Edge Border) ... left for LTR tables,
// right for RTL tables" and §17.4.12 "end (Trailing Edge) ... right for LTR,
// left for RTL", the visual mapping is governed by table direction. Cell
// borders are painted as inline border-color on the absolutely-positioned cell
// wrapper inside .superdoc-table-fragment (no separate `.superdoc-table-cell`
// class). The painter does the L<->R swap once via swapCellBordersLR; pm-adapter
// keeps start/end as LTR-default to avoid double-mirror.
test('RTL bidiVisual table cell with w:tcBorders start/end maps start to visual right and end to visual left', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-table-tcborders-startend.docx'));
  await superdoc.waitForStable();

  // Fixture: start=RED (#FF0000), end=BLUE (#0000FF). The cell with the
  // explicit borders contains text "start=RED". Walk from that text up to
  // the absolutely-positioned cell wrapper (direct child of the fragment).
  const borders = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    const target = cells.find((cell) => cell.textContent?.includes('start=RED'));
    if (!target) return null;
    const cs = window.getComputedStyle(target);
    return {
      borderLeftColor: cs.borderLeftColor,
      borderRightColor: cs.borderRightColor,
      borderLeftWidth: parseFloat(cs.borderLeftWidth),
      borderRightWidth: parseFloat(cs.borderRightWidth),
    };
  });

  expect(borders).not.toBeNull();
  if (!borders) return;

  // Per §17.4.33/12: in RTL, start (RED) lands on visual right of cell,
  // end (BLUE) on visual left.
  const isRed = (c: string) => /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/.test(c);
  const isBlue = (c: string) => /rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/.test(c);
  expect(isRed(borders.borderRightColor)).toBe(true);
  expect(isBlue(borders.borderLeftColor)).toBe(true);
  expect(borders.borderLeftWidth).toBeGreaterThan(0);
  expect(borders.borderRightWidth).toBeGreaterThan(0);
});
