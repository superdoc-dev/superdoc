import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_TCBORDERS_DOC = path.resolve(__dirname, 'fixtures/rtl-table-tcborders-startend.docx');

test('rtl tcBorders start/end render horizontal side borders on target cell', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_TCBORDERS_DOC);
  await superdoc.waitForStable();

  const borders = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('[data-table-boundaries]') as HTMLElement | null;
    if (!fragment) return null;

    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent?.includes('start=RED')) {
        textNode = node;
        break;
      }
    }
    if (!textNode) return null;

    let el = textNode.parentElement as HTMLElement | null;
    while (el && el !== fragment) {
      const cs = window.getComputedStyle(el);
      const leftW = Number.parseFloat(cs.borderLeftWidth);
      const rightW = Number.parseFloat(cs.borderRightWidth);
      if (leftW > 0 || rightW > 0) {
        return {
          borderLeftColor: cs.borderLeftColor,
          borderRightColor: cs.borderRightColor,
          borderLeftWidth: leftW,
          borderRightWidth: rightW,
        };
      }
      el = el.parentElement;
    }

    return null;
  });

  expect(borders).not.toBeNull();
  if (!borders) return;

  expect(borders.borderRightWidth).toBeGreaterThan(0);
  expect(borders.borderLeftWidth).toBeGreaterThan(0);

  // Per §17.4.33/12: in an RTL bidiVisual table, the start (leading) border
  // sits on the visual right of the cell and end (trailing) on visual left.
  // Fixture: start=RED (#FF0000), end=BLUE (#0000FF). Check the color side
  // mapping, not just the existence of widths, so a regression that puts
  // start on the wrong visual edge fails here instead of silently passing.
  const isRed = (c: string) => /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/.test(c);
  const isBlue = (c: string) => /rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/.test(c);
  expect(isRed(borders.borderRightColor)).toBe(true);
  expect(isBlue(borders.borderLeftColor)).toBe(true);
});
