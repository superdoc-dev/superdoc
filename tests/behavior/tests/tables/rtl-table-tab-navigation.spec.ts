import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'full', showCaret: true, showSelection: true } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = [
  path.resolve(__dirname, 'fixtures/rtl-table-1.docx'),
  path.resolve(__dirname, 'fixtures/rtl-table-2.docx'),
] as const;

async function getSelectionLineY(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => {
    const editor = (window as any).editor;
    const pos = editor?.state?.selection?.from;
    if (typeof pos !== 'number') return null;

    const lines = Array.from(document.querySelectorAll<HTMLElement>('.superdoc-line'));
    let nearest: { y: number; distance: number } | null = null;
    for (const line of lines) {
      const start = Number(line.dataset.pmStart ?? 'NaN');
      const end = Number(line.dataset.pmEnd ?? 'NaN');
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (pos >= start && pos <= end) {
        return line.getBoundingClientRect().y;
      }

      const distance = pos < start ? start - pos : pos > end ? pos - end : 0;
      const y = line.getBoundingClientRect().y;
      if (!nearest || distance < nearest.distance) {
        nearest = { y, distance };
      }
    }

    return nearest?.y ?? null;
  });
}

for (const docPath of DOCS) {
  test(`rtl table Tab from visual top-left moves out of the first visual row (${path.basename(docPath)})`, async ({
    superdoc,
  }) => {
    await superdoc.loadDocument(docPath);
    await superdoc.waitForStable();

    const clickPoint = await superdoc.page.evaluate(() => {
      const frag = document.querySelector('.superdoc-table-fragment') as HTMLElement | null;
      if (!frag) return null;
      const r = frag.getBoundingClientRect();
      return { x: r.x + 8, y: r.y + 8 };
    });

    expect(clickPoint).not.toBeNull();
    if (!clickPoint) return;

    await superdoc.page.mouse.click(clickPoint.x, clickPoint.y);
    await superdoc.waitForStable();

    const before = await getSelectionLineY(superdoc.page);
    expect(before).not.toBeNull();
    if (!before) return;

    await superdoc.press('Tab');
    await superdoc.waitForStable();

    const after = await getSelectionLineY(superdoc.page);
    expect(after).not.toBeNull();
    if (!after) return;

    // Word-like RTL-table behavior reported by customers: from visual top-left,
    // first Tab leaves the current visual row (typically to next row's visual right cell).
    // We assert this by requiring a visible downward move of the painted caret.
    expect(after).toBeGreaterThan(before + 1);
  });

  test(`rtl table Shift+Tab from second visual row returns to first visual row (${path.basename(docPath)})`, async ({
    superdoc,
  }) => {
    await superdoc.loadDocument(docPath);
    await superdoc.waitForStable();

    const clickPoint = await superdoc.page.evaluate(() => {
      const frag = document.querySelector('.superdoc-table-fragment') as HTMLElement | null;
      if (!frag) return null;
      const r = frag.getBoundingClientRect();
      return { x: r.x + 8, y: r.y + 8 };
    });

    expect(clickPoint).not.toBeNull();
    if (!clickPoint) return;

    await superdoc.page.mouse.click(clickPoint.x, clickPoint.y);
    await superdoc.waitForStable();

    await superdoc.press('Tab');
    await superdoc.waitForStable();
    const afterTab = await getSelectionLineY(superdoc.page);
    expect(afterTab).not.toBeNull();
    if (!afterTab) return;

    await superdoc.page.keyboard.press('Shift+Tab');
    await superdoc.waitForStable();
    const afterShiftTab = await getSelectionLineY(superdoc.page);
    expect(afterShiftTab).not.toBeNull();
    if (!afterShiftTab) return;

    expect(afterShiftTab).toBeLessThan(afterTab - 1);
  });
}
