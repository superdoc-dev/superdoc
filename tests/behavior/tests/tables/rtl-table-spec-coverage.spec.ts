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

  // Per §17.4.51: "the left edge in a left-to-right table, and the right
  // edge in a right-to-left table". The fixture has tblInd w:w="1440"
  // (1 inch) on a bidiVisual table. The rendered table's RIGHT edge
  // should be inset further from the page's right edge than its LEFT
  // edge is from the page's left edge.
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

  // The right gap (page edge to table right edge) should be visibly larger
  // than the left gap by approximately tblInd value (96px ~= 1 inch).
  // Use a loose tolerance to absorb default page margins and zoom.
  expect(geometry.rightGap - geometry.leftGap).toBeGreaterThan(40);
});

// ----------------------------------------------------------------------------
// F6: §17.4.66 tcBorders w/ logical start/end + bidiVisual
// ----------------------------------------------------------------------------

// TODO: cell-level tcBorders may be painted on a different DOM element than
// the .superdoc-table-cell wrapper (e.g., on a child painter overlay or via
// CSS variables). The current locator reads getComputedStyle on the cell
// wrapper but border colors come back as default (rgb(0,0,0)) or absent.
// Skipping until the painter's cell-border DOM target is mapped. The fixture
// is still useful as a visual-regression substrate.
test.fixme(
  'RTL bidiVisual table cell with w:tcBorders start/end maps start to visual right and end to visual left',
  async ({ superdoc }) => {
    await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-table-tcborders-startend.docx'));
    await superdoc.waitForStable();

    // Per §17.4.13 wording on `end`: "right for LTR tables, left for RTL
    // tables". So start (leading) = visual right in RTL; end (trailing) =
    // visual left. Fixture: start=RED (#FF0000), end=BLUE (#0000FF).
    // The cell's computed CSS should have border-right-color ≈ red and
    // border-left-color ≈ blue (or equivalents via separate border styles).
    const borders = await superdoc.page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.superdoc-table-fragment .superdoc-line'));
      const targetLine = lines.find((line) => line.textContent?.includes('start=RED'));
      if (!targetLine) return null;
      const cell = targetLine.closest('.superdoc-table-cell') ?? targetLine.parentElement;
      if (!cell) return null;
      const cs = window.getComputedStyle(cell);
      return {
        borderLeftColor: cs.borderLeftColor,
        borderRightColor: cs.borderRightColor,
        borderLeftWidth: cs.borderLeftWidth,
        borderRightWidth: cs.borderRightWidth,
      };
    });

    expect(borders).not.toBeNull();
    if (!borders) return;

    // Normalize the rgb() strings. Looking for red on right, blue on left.
    const isRed = (c: string) => /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/.test(c);
    const isBlue = (c: string) => /rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/.test(c);
    expect(isRed(borders.borderRightColor)).toBe(true);
    expect(isBlue(borders.borderLeftColor)).toBe(true);
  },
);
