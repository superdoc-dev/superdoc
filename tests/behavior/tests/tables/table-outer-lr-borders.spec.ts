import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_DOC = path.resolve(__dirname, 'fixtures/rtl-table-vmerge.docx');
const LTR_DOC = path.resolve(__dirname, 'fixtures/ltr-table.docx');

for (const docPath of [RTL_DOC, LTR_DOC]) {
  test(`table outer left/right borders render on edge cells (${path.basename(docPath)})`, async ({ superdoc }) => {
    await superdoc.loadDocument(docPath);
    await superdoc.waitForStable();

    const borders = await superdoc.page.evaluate(() => {
      const fragment = document.querySelector('.superdoc-table-fragment') as HTMLElement | null;
      if (!fragment) return null;
      const fragmentStyle = window.getComputedStyle(fragment);
      const fragmentLeft = Number.parseFloat(fragmentStyle.borderLeftWidth);
      const fragmentRight = Number.parseFloat(fragmentStyle.borderRightWidth);

      const cells = Array.from(fragment.querySelectorAll(':scope > div')) as HTMLElement[];
      if (cells.length === 0) return null;

      // Visual edges are geometric: smallest left and largest right among rendered cells.
      let leftCell: HTMLElement | null = null;
      let rightCell: HTMLElement | null = null;
      let minLeft = Number.POSITIVE_INFINITY;
      let maxRight = Number.NEGATIVE_INFINITY;

      for (const cell of cells) {
        const r = cell.getBoundingClientRect();
        if (r.left < minLeft) {
          minLeft = r.left;
          leftCell = cell;
        }
        if (r.right > maxRight) {
          maxRight = r.right;
          rightCell = cell;
        }
      }

      if (!leftCell || !rightCell) return null;

      const leftStyle = window.getComputedStyle(leftCell);
      const rightStyle = window.getComputedStyle(rightCell);

      return {
        fragmentLeftBorderWidth: fragmentLeft,
        fragmentRightBorderWidth: fragmentRight,
        visualLeftBorderWidth: Number.parseFloat(leftStyle.borderLeftWidth),
        visualRightBorderWidth: Number.parseFloat(rightStyle.borderRightWidth),
      };
    });

    expect(borders).not.toBeNull();
    if (!borders) return;

    const containerHasOuter = borders.fragmentLeftBorderWidth > 0 && borders.fragmentRightBorderWidth > 0;
    const edgeCellsHaveOuter = borders.visualLeftBorderWidth > 0 && borders.visualRightBorderWidth > 0;

    expect(containerHasOuter || edgeCellsHaveOuter).toBe(true);
  });
}
