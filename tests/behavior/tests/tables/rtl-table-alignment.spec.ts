import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RTL_TBLIND_DOC = path.resolve(__dirname, 'fixtures/rtl-table-tblind.docx');

test('bidiVisual table without explicit jc is visually right-aligned (rtl-table-tblind)', async ({ superdoc }) => {
  await superdoc.loadDocument(RTL_TBLIND_DOC);
  await superdoc.waitForStable();

  const alignment = await superdoc.page.evaluate(() => {
    const table = document.querySelector('.superdoc-table-fragment') as HTMLElement | null;
    if (!table) return null;

    const page = table.closest('.superdoc-page') as HTMLElement | null;
    if (!page) return null;

    const tableRect = table.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();

    const leftGap = tableRect.left - pageRect.left;
    const rightGap = pageRect.right - tableRect.right;

    return { leftGap, rightGap };
  });

  expect(alignment).not.toBeNull();
  if (!alignment) return;

  // Word behavior for bidiVisual + no jc: table defaults to RTL start edge (visual right).
  expect(alignment.rightGap).toBeLessThan(alignment.leftGap);
});
