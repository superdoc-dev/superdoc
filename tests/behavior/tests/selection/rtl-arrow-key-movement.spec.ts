import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-mixed-bidi.docx');

test.skip(!fs.existsSync(DOC_PATH), 'RTL fixture not available');

test.use({ config: { toolbar: 'none', showCaret: true, showSelection: true } });

test.describe('RTL arrow key cursor movement (SD-2390)', () => {
  test('ArrowLeft moves cursor visually left in RTL paragraph', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    // First line is RTL Arabic: "هذه فقرة كاملة باللغة العربية"
    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    // Click near the right edge (logical start of RTL text)
    await superdoc.page.mouse.click(box.x + box.width - 20, box.y + box.height / 2);
    await superdoc.waitForStable();

    const before = await superdoc.getSelection();

    // Get caret X before
    const xBefore = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, before.from);

    // Press ArrowLeft
    await superdoc.page.keyboard.press('ArrowLeft');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    const xAfter = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, after.from);

    // In RTL, ArrowLeft should move visually left (decreasing X)
    expect(xAfter).toBeLessThan(xBefore);
    // PM position should increase (moving toward end of line in document order)
    expect(after.from).toBeGreaterThan(before.from);
  });

  test('ArrowRight moves cursor visually right in RTL paragraph', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    // Click near the middle of the line
    await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await superdoc.waitForStable();

    const before = await superdoc.getSelection();
    const xBefore = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, before.from);

    // Press ArrowRight
    await superdoc.page.keyboard.press('ArrowRight');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    const xAfter = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, after.from);

    // In RTL, ArrowRight should move visually right (increasing X)
    expect(xAfter).toBeGreaterThan(xBefore);
    // PM position should decrease (moving toward start of line in document order)
    expect(after.from).toBeLessThan(before.from);
  });

  test('ArrowLeft/Right in LTR paragraph still works correctly', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    // Second line is LTR English: "This is a complete English paragraph"
    const ltrLine = superdoc.page.locator('.superdoc-line').nth(1);
    const box = await ltrLine.boundingBox();
    if (!box) throw new Error('LTR line not visible');

    // Click near the left edge
    await superdoc.page.mouse.click(box.x + 30, box.y + box.height / 2);
    await superdoc.waitForStable();

    const before = await superdoc.getSelection();
    const xBefore = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, before.from);

    // Press ArrowRight in LTR
    await superdoc.page.keyboard.press('ArrowRight');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    const xAfter = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, after.from);

    // In LTR, ArrowRight moves visually right (increasing X) and increases PM position
    expect(xAfter).toBeGreaterThan(xBefore);
    expect(after.from).toBeGreaterThan(before.from);
  });
});
