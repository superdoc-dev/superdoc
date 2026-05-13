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
});
