import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_PADDING_DOC = path.resolve(__dirname, 'fixtures/rtl-table-col1-tcw-divergent.docx');

test('rtl bidiVisual table cell keeps non-zero horizontal padding (rtl-table-col1-tcw-divergent)', async ({
  superdoc,
}) => {
  await superdoc.loadDocument(RTL_PADDING_DOC);
  await superdoc.waitForStable();

  const padding = await superdoc.page.evaluate(() => {
    const fragment = document.querySelector('[data-table-boundaries]') as HTMLElement | null;
    if (!fragment) return null;

    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent?.includes('divergent')) {
        textNode = node;
        break;
      }
    }
    if (!textNode) return null;

    let el = textNode.parentElement as HTMLElement | null;
    while (el && el !== fragment) {
      const cs = window.getComputedStyle(el);
      const paddingLeft = Number.parseFloat(cs.paddingLeft);
      const paddingRight = Number.parseFloat(cs.paddingRight);
      if (paddingLeft > 0 || paddingRight > 0) {
        return { paddingLeft, paddingRight };
      }
      el = el.parentElement;
    }

    return null;
  });

  expect(padding).not.toBeNull();
  if (!padding) return;

  expect(padding.paddingLeft).toBeGreaterThan(0);
  expect(padding.paddingRight).toBeGreaterThan(0);
  // Fixture defines symmetric physical left/right margins, so rendered paddings should match.
  expect(Math.abs(padding.paddingLeft - padding.paddingRight)).toBeLessThan(0.75);
});
