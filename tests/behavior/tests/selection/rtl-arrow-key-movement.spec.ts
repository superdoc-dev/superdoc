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

  test('Shift+ArrowLeft expands selection visually left in RTL paragraph', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    await superdoc.page.mouse.click(box.x + box.width - 20, box.y + box.height / 2);
    await superdoc.waitForStable();

    const before = await superdoc.getSelection();

    await superdoc.page.keyboard.down('Shift');
    await superdoc.page.keyboard.press('ArrowLeft');
    await superdoc.page.keyboard.up('Shift');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    expect(after.to - after.from).toBeGreaterThan(0);
  });

  test('Shift+ArrowRight expands selection visually right in RTL paragraph', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await superdoc.waitForStable();

    const before = await superdoc.getSelection();

    await superdoc.page.keyboard.down('Shift');
    await superdoc.page.keyboard.press('ArrowRight');
    await superdoc.page.keyboard.up('Shift');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    expect(after.to - after.from).toBeGreaterThan(0);
  });

  test('Home moves caret to visual start (right edge) of RTL line', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    // Click near line middle to avoid already being at boundary.
    await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await superdoc.waitForStable();

    const before = await superdoc.getSelection();
    const xBefore = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, before.from);

    await superdoc.page.keyboard.press('Home');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    const xAfter = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, after.from);

    expect(after.from).not.toBe(before.from);
    expect(xAfter).toBeGreaterThan(xBefore);
  });

  test('End moves caret to visual end (left edge) of RTL line', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const box = await rtlLine.boundingBox();
    if (!box) throw new Error('RTL line not visible');

    // Click near line middle first, then force known start state via Home.
    await superdoc.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await superdoc.waitForStable();

    await superdoc.page.keyboard.press('Home');
    await superdoc.waitForStable();

    const beforeHome = await superdoc.getSelection();
    const xBeforeHome = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, beforeHome.from);

    await superdoc.page.keyboard.press('End');
    await superdoc.waitForStable();

    const after = await superdoc.getSelection();
    const xAfter = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, after.from);

    expect(xAfter).toBeLessThanOrEqual(xBeforeHome);

    await superdoc.page.keyboard.press('End');
    await superdoc.waitForStable();

    const afterSecondEnd = await superdoc.getSelection();
    const xAfterSecondEnd = await superdoc.page.evaluate((pos) => {
      const pe = (window as any).superdoc?.activeEditor?.presentationEditor;
      return pe?.computeCaretLayoutRect(pos)?.x;
    }, afterSecondEnd.from);

    // Boundary behavior can differ by 1 PM position across engines; keep a visual invariant:
    // repeated End should not move caret to the visual right.
    expect(xAfterSecondEnd).toBeLessThanOrEqual(xAfter + 0.5);
  });

  test('Mod+A selects full document with RTL content', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const firstLine = superdoc.page.locator('.superdoc-line').first();
    const firstLineBox = await firstLine.boundingBox();
    if (!firstLineBox) throw new Error('First line not visible');
    await superdoc.page.mouse.click(firstLineBox.x + 20, firstLineBox.y + firstLineBox.height / 2);
    await superdoc.waitForStable();

    const selectAllShortcut = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
    await superdoc.page.keyboard.press(selectAllShortcut);
    await superdoc.waitForStable();

    const stateSelection = await superdoc.page.evaluate(() => {
      const state = (window as any).superdoc?.activeEditor?.state;
      if (!state?.selection) return null;
      return {
        from: state.selection.from,
        to: state.selection.to,
        min: 0,
        max: state.doc.content.size,
      };
    });

    expect(stateSelection).not.toBeNull();
    expect(
      (stateSelection as { to: number; from: number }).to - (stateSelection as { to: number; from: number }).from,
    ).toBeGreaterThan(0);
    expect((stateSelection as { min: number; from: number }).from).toBe(
      (stateSelection as { min: number; from: number }).min,
    );
    expect((stateSelection as { max: number; to: number }).to).toBe(
      (stateSelection as { max: number; to: number }).max,
    );
  });

  test('Typing in a new empty paragraph created from RTL line keeps RTL direction', async ({ superdoc }) => {
    await superdoc.loadDocument(DOC_PATH);
    await superdoc.waitForStable();

    const rtlLine = superdoc.page.locator('.superdoc-line').first();
    const rtlEnd = Number(await rtlLine.getAttribute('data-pm-end'));
    if (!Number.isFinite(rtlEnd)) throw new Error('RTL line end is not available');

    await superdoc.setTextSelection(rtlEnd, rtlEnd);
    await superdoc.page.keyboard.press('Enter');
    await superdoc.waitForStable();

    await superdoc.page.keyboard.insertText('ا');
    await superdoc.waitForStable();

    const insertedLine = superdoc.page.locator('.superdoc-line').nth(1);
    await expect(insertedLine).toContainText('ا');

    const direction = await insertedLine.evaluate((el) => getComputedStyle(el).direction);
    expect(direction).toBe('rtl');
  });
});
