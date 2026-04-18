import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-mixed-bidi.docx');

test.skip(!fs.existsSync(DOC_PATH), 'RTL fixture not available');

test.use({ config: { toolbar: 'none', showCaret: true, showSelection: true } });

test.describe('RTL click-to-position mapping', () => {
  test('clicking left and right of RTL line places cursor at different positions', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    // First line is RTL Arabic text: "هذه فقرة كاملة باللغة العربية"
    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    // Click near the right edge (logical start of RTL text)
    await superdoc.page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
    await superdoc.waitForStable();
    const selRight = await superdoc.getSelection();

    // Click near the left edge (logical end of RTL text)
    await superdoc.page.mouse.click(box.x + 10, box.y + box.height / 2);
    await superdoc.waitForStable();
    const selLeft = await superdoc.getSelection();

    expect(selRight.from).toBeGreaterThan(0);
    expect(selLeft.from).toBeGreaterThan(0);

    // In RTL, clicking right (text start) should give a lower PM position
    // than clicking left (text end)
    expect(selRight.from).toBeLessThan(selLeft.from);
  });

  test('clicking inside RTL text places cursor at valid position', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    // First line is RTL: "هذه فقرة كاملة باللغة العربية"
    // RTL text renders right-aligned, so we need to click within the text area
    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    // Find the first span to know where the visible text actually is
    const span = superdoc.page.locator('.superdoc-line').first().locator('span[data-pm-start]').first();
    const spanBox = await span.boundingBox();
    if (!spanBox) throw new Error('RTL span not visible');

    // Click inside the visible text area (middle of the span)
    await superdoc.page.mouse.click(spanBox.x + spanBox.width / 2, spanBox.y + spanBox.height / 2);
    await superdoc.waitForStable();

    const sel = await superdoc.getSelection();
    const lineStart = Number(await rtlLine.getAttribute('data-pm-start'));
    const lineEnd = Number(await rtlLine.getAttribute('data-pm-end'));

    // Cursor should be within the line's PM range
    expect(sel.from).toBeGreaterThanOrEqual(lineStart);
    expect(sel.from).toBeLessThanOrEqual(lineEnd);
  });

  test('clicking left edge of RTL and LTR lines gives opposite ends', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const lines = superdoc.page.locator('.superdoc-line');

    // Line 0: RTL (pm 2-47), Line 1: LTR (pm 51-87)
    const rtlLine = lines.nth(0);
    const ltrLine = lines.nth(1);

    const rtlBox = await rtlLine.boundingBox();
    const ltrBox = await ltrLine.boundingBox();
    if (!rtlBox || !ltrBox) throw new Error('Lines not visible');

    // Click left edge of LTR line → should land near lineStart
    await superdoc.page.mouse.click(ltrBox.x + 10, ltrBox.y + ltrBox.height / 2);
    await superdoc.waitForStable();
    const selLtr = await superdoc.getSelection();
    const ltrStart = Number(await ltrLine.getAttribute('data-pm-start'));
    const ltrEnd = Number(await ltrLine.getAttribute('data-pm-end'));

    // Click left edge of RTL line → should land near lineEnd (inverted)
    await superdoc.page.mouse.click(rtlBox.x + 10, rtlBox.y + rtlBox.height / 2);
    await superdoc.waitForStable();
    const selRtl = await superdoc.getSelection();
    const rtlStart = Number(await rtlLine.getAttribute('data-pm-start'));
    const rtlEnd = Number(await rtlLine.getAttribute('data-pm-end'));

    // LTR: left click → near start of line
    expect(selLtr.from).toBeLessThan(ltrStart + (ltrEnd - ltrStart) / 2);

    // RTL: left click → near end of line (inverted direction)
    expect(selRtl.from).toBeGreaterThan(rtlStart + (rtlEnd - rtlStart) / 2);
  });

  test('clicking on mixed bidi RTL line places cursor correctly', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    // Line 3: RTL mixed bidi "نص عربي ثم English text ثم عربي مرة أخرى"
    const mixedLine = superdoc.page.locator('.superdoc-line').nth(3);
    const box = await mixedLine.boundingBox();
    if (!box) throw new Error('Mixed bidi line not visible');

    // Click left edge
    await superdoc.page.mouse.click(box.x + 10, box.y + box.height / 2);
    await superdoc.waitForStable();
    const selLeft = await superdoc.getSelection();

    // Click right edge
    await superdoc.page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
    await superdoc.waitForStable();
    const selRight = await superdoc.getSelection();

    expect(selLeft.from).toBeGreaterThan(0);
    expect(selRight.from).toBeGreaterThan(0);
    expect(selLeft.from).not.toBe(selRight.from);
  });
});
