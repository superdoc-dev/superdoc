import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', showSelection: true } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SD-3171 positive control: when `w:bidiVisual` is set INLINE on the table's
// own `tblPr` (not via a style), Word visually flips the cell order. The
// companion test rtl-style-derived-bidivisual.spec.ts pins the negative
// control (style cascade does NOT visually flip).
//
// Verified empirically: opening this fixture in Word shows
// `Document.Tables(1).TableDirection === 0` (wdTableDirectionRtl) and
// renders cells visually right-to-left (logical first cell on visual right).
//
// Together these two tests prove the SD-3171 fix is direction-specific: the
// inline path is preserved, the style-cascade path is what changed.

test('table with inline bidiVisual flips cells visually (logical first on visual right)', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-inline-bidivisual.docx'));
  await superdoc.waitForStable();

  // Fixture: 1x3 table, logical cells A B C, inline `w:bidiVisual`.
  // Expected visual order (left to right): C B A.
  const cellLayout = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const fragRect = fragment.getBoundingClientRect();
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    if (cells.length === 0) return null;
    return cells
      .map((cell) => {
        const rect = (cell as HTMLElement).getBoundingClientRect();
        return { text: (cell.textContent ?? '').trim(), relLeft: rect.left - fragRect.left };
      })
      .filter((c) => c.text === 'A' || c.text === 'B' || c.text === 'C')
      .sort((a, b) => a.relLeft - b.relLeft);
  });

  expect(cellLayout).not.toBeNull();
  if (!cellLayout) return;

  expect(cellLayout).toHaveLength(3);
  // Inline bidiVisual produces visualDirection='rtl' → painter mirrors cells.
  expect(cellLayout.map((c) => c.text)).toEqual(['C', 'B', 'A']);
});
