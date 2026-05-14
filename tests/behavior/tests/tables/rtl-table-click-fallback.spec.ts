import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showCaret: true, showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = [
  path.resolve(__dirname, 'fixtures/rtl-table-1.docx'),
  path.resolve(__dirname, 'fixtures/rtl-table-2.docx'),
] as const;

for (const docPath of DOCS) {
  test(`rtl table click mapping stays in cell for text and empty-area clicks (${path.basename(docPath)})`, async ({
    superdoc,
  }) => {
    await superdoc.loadDocument(docPath);
    await superdoc.waitForStable();

    const data = await superdoc.page.evaluate(() => {
      const line = document.querySelector('.superdoc-table-fragment .superdoc-line') as HTMLElement | null;
      if (!line) {
        return null;
      }

      const lineRect = line.getBoundingClientRect();
      const linePmStart = Number(line.dataset.pmStart ?? 'NaN');
      const linePmEnd = Number(line.dataset.pmEnd ?? 'NaN');

      // Find cell container by style signature used by DomPainter table cells.
      let cell: HTMLElement | null = line.parentElement as HTMLElement | null;
      while (cell) {
        const style = getComputedStyle(cell);
        if (style.position === 'absolute' && style.overflow === 'hidden') {
          break;
        }
        cell = cell.parentElement as HTMLElement | null;
      }

      if (!cell) {
        return null;
      }

      const cellRect = cell.getBoundingClientRect();

      const textPoint = {
        x: lineRect.x + Math.min(Math.max(8, lineRect.width * 0.5), Math.max(8, lineRect.width - 8)),
        y: lineRect.y + lineRect.height / 2,
      };

      // Empty area in same cell: lower part of the cell, away from the text line.
      const emptyPoint = {
        x: Math.min(Math.max(cellRect.x + 8, textPoint.x), cellRect.right - 8),
        y: Math.max(lineRect.bottom + 6, cellRect.y + cellRect.height * 0.8),
      };

      return {
        linePmStart,
        linePmEnd,
        textPoint,
        emptyPoint,
      };
    });

    expect(data).not.toBeNull();
    if (!data) return;

    await superdoc.page.mouse.click(data.textPoint.x, data.textPoint.y);
    await superdoc.waitForStable();
    const afterTextClick = await superdoc.getSelection();
    expect(afterTextClick.from).toBeGreaterThanOrEqual(data.linePmStart);
    expect(afterTextClick.from).toBeLessThanOrEqual(data.linePmEnd);

    await superdoc.page.mouse.click(data.emptyPoint.x, data.emptyPoint.y);
    await superdoc.waitForStable();
    const afterEmptyClick = await superdoc.getSelection();
    expect(afterEmptyClick.from).toBeGreaterThanOrEqual(data.linePmStart);
    expect(afterEmptyClick.from).toBeLessThanOrEqual(data.linePmEnd);
  });
}
