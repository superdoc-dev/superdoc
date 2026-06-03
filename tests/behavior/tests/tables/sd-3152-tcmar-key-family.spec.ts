import { test, expect } from '../../fixtures/superdoc.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.use({ config: { toolbar: 'full', showSelection: true } });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SuperDoc imports w:tcMar children regardless of whether the source used
// logical (w:start/w:end per Part 1 §17.4.35 / §17.4.10) or physical
// (w:left/w:right per Part 4 §14.3.3 / §14.3.8) names. attrs.cellMargins
// is the LTR-default physical-only painter view, so both cells should
// render with the same paddingLeft/paddingRight in an LTR table.
//
// Fixture: one row, two cells. Cell A tcMar has logical-only start=480 dxa,
// end=60 dxa. Cell B tcMar has physical-only left=480 dxa, right=60 dxa.
// Both cells should resolve to paddingLeft ≈ 32 px, paddingRight ≈ 4 px.
test('LTR table with logical-only tcMar and physical-only tcMar resolves to the same padding', async ({ superdoc }) => {
  await superdoc.loadDocument(path.resolve(__dirname, 'fixtures/sd-3152-tcmar-key-family.docx'));
  await superdoc.waitForStable();

  const padding = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('.superdoc-table-fragment');
    if (!fragment) return null;
    const cells = Array.from(fragment.children).filter((el) => (el as HTMLElement).style?.position === 'absolute');
    if (cells.length < 2) return null;
    // Cell A first, Cell B second in document order.
    const cellA = cells[0];
    const cellB = cells[1];
    const read = (el: Element) => {
      const cs = window.getComputedStyle(el);
      return {
        paddingLeft: parseFloat(cs.paddingLeft),
        paddingRight: parseFloat(cs.paddingRight),
      };
    };
    return { a: read(cellA), b: read(cellB) };
  });

  expect(padding).not.toBeNull();
  if (!padding) return;

  // Cell A (logical-only source): paddingLeft >> paddingRight per the values.
  expect(padding.a.paddingLeft).toBeGreaterThan(20);
  expect(padding.a.paddingRight).toBeLessThan(10);
  // Cell B (physical-only source): same effective physical padding.
  expect(padding.b.paddingLeft).toBeGreaterThan(20);
  expect(padding.b.paddingRight).toBeLessThan(10);
  // Logical and physical sources resolve to the same physical padding (within
  // a 1px tolerance for twip-to-px rounding).
  expect(Math.abs(padding.a.paddingLeft - padding.b.paddingLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(padding.a.paddingRight - padding.b.paddingRight)).toBeLessThanOrEqual(1);
});
