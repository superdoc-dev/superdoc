import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', showSelection: true } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SD-3171 Word-parity contract: `w:bidiVisual` visually flips cell order ONLY
// when set inline on the table itself. Word does NOT visually flip cells when
// the only source of `w:bidiVisual` is a style cascade.
//
// Verified empirically: opening this fixture in Word shows
// `Document.Tables(1).TableDirection === 1` (wdTableDirectionLtr) and renders
// cells in logical order A B C. SuperDoc must match.
//
// History: PR #3350 originally asserted this fixture renders C B A (cells
// visually flipped). That pinned SuperDoc's own pre-SD-3171 behavior, not
// Word's. The flip came from pm-adapter's SD-3138 Phase 1B cascade path that
// fell through from inline to style-resolved `bidiVisual`. SD-3171 removes
// that fallback so style-cascade `bidiVisual` is ignored for visual direction.
// The companion test rtl-inline-bidivisual.spec.ts pins the positive control
// (inline `bidiVisual` still flips cells).

test('table with style-derived bidiVisual renders cells in logical order (Word-parity)', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/rtl-style-derived-bidivisual.docx'));
  await superdoc.waitForStable();

  // Fixture: 1x3 table, logical cells A B C, style-set `bidiVisual`.
  // Expected visual order (left to right): A B C.
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
  // SD-3171: style-cascade `bidiVisual` does not visually flip cells. Match Word.
  expect(cellLayout.map((c) => c.text)).toEqual(['A', 'B', 'C']);
});
