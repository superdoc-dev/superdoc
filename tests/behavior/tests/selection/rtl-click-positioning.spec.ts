import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, 'fixtures/rtl-mixed-bidi.docx');
const MIXED_BIDI_DOC_PATH = path.resolve(__dirname, 'fixtures/mixed-bidi-2.docx');

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

  test('Backspace at mixed-bidi boundary mutates content from a boundary caret', async ({ superdoc, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox mixed-bidi boundary caret/backspace geometry differs from Chromium/WebKit in this fixture.',
    );

    await superdoc.loadDocument(MIXED_BIDI_DOC_PATH);
    await superdoc.waitForStable();

    const beforeText = await superdoc.getTextContent();

    const boundaryPoint = await superdoc.page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.superdoc-line'));
      for (const line of lines) {
        const spans = Array.from(line.querySelectorAll('span[data-pm-start][data-pm-end]')) as HTMLElement[];
        const rtlSpan = spans.find((span) => /[\u0590-\u05FF\u0600-\u06FF]/.test(span.textContent ?? ''));
        const ltrSpan = spans.find((span) => /[A-Za-z]/.test(span.textContent ?? ''));
        if (!rtlSpan || !ltrSpan) continue;

        const ltrRect = ltrSpan.getBoundingClientRect();
        return {
          x: ltrRect.left + 2,
          y: ltrRect.top + ltrRect.height / 2,
        };
      }
      return null;
    });

    expect(boundaryPoint).not.toBeNull();
    if (!boundaryPoint) return;

    await superdoc.page.mouse.click(boundaryPoint.x, boundaryPoint.y);
    await superdoc.waitForStable();

    const beforeSel = await superdoc.getSelection();
    expect(beforeSel.from).toBe(beforeSel.to);

    const boundaryChars = await superdoc.page.evaluate(({ x, y }) => {
      const resolveAt = (probeX: number) => {
        const lineEl = document
          .elementsFromPoint(probeX, y)
          .find((el) => (el as HTMLElement).classList?.contains('superdoc-line')) as HTMLElement | undefined;
        if (!lineEl) return null;

        type CharBox = { char: string; left: number; right: number; centerX: number; centerY: number };
        const chars: CharBox[] = [];
        const doc = document;
        const walker = doc.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode() as Text | null;
        while (node) {
          const text = node.textContent ?? '';
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (!ch || /\s/.test(ch)) continue;
            const range = doc.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              chars.push({
                char: ch,
                left: rect.left,
                right: rect.right,
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,
              });
            }
          }
          node = walker.nextNode() as Text | null;
        }

        const sameVisualBand = chars.filter((c) => Math.abs(c.centerY - y) <= 6);
        const band = sameVisualBand.length > 0 ? sameVisualBand : chars;
        if (band.length === 0) return null;

        band.sort((a, b) => a.centerX - b.centerX);

        let leftChar: CharBox | null = null;
        let rightChar: CharBox | null = null;
        let leftIndex = -1;
        for (const c of band) {
          if (c.centerX < probeX) {
            if (!leftChar || c.centerX > leftChar.centerX) {
              leftChar = c;
              leftIndex = band.indexOf(c);
            }
          }
          if (c.centerX >= probeX) {
            if (!rightChar || c.centerX < rightChar.centerX) rightChar = c;
          }
        }

        return {
          linePmStart: lineEl.getAttribute('data-pm-start'),
          linePmEnd: lineEl.getAttribute('data-pm-end'),
          visualSequence: band.map((c) => c.char).join(''),
          visualLeftIndex: leftIndex,
          visualLeftChar: leftChar?.char ?? null,
          visualRightChar: rightChar?.char ?? null,
        };
      };

      const probes = [0, -1, -2, 1];
      for (const dx of probes) {
        const resolved = resolveAt(x + dx);
        if (resolved?.visualLeftChar) return resolved;
      }
      return resolveAt(x);
    }, boundaryPoint);

    expect(boundaryChars).not.toBeNull();
    expect(boundaryChars?.visualLeftChar).not.toBeNull();

    await superdoc.press('Backspace');
    await superdoc.waitForStable();

    const afterText = await superdoc.getTextContent();
    const afterSel = await superdoc.getSelection();

    expect(afterText).not.toBe(beforeText);
    expect(afterText.length).toBe(beforeText.length - 1);
    expect(afterSel.from).toBe(afterSel.to);

    const countChar = (text: string, char: string): number => {
      let count = 0;
      for (const ch of text) if (ch === char) count++;
      return count;
    };

    const deletedChar = boundaryChars?.visualLeftChar;
    if (deletedChar) {
      const beforeDeletedCount = countChar(beforeText, deletedChar);
      const afterDeletedCount = countChar(afterText, deletedChar);
      expect(afterDeletedCount).toBe(beforeDeletedCount - 1);
    }

    const controlChar = boundaryChars?.visualRightChar;
    if (controlChar && controlChar !== deletedChar) {
      const beforeControlCount = countChar(beforeText, controlChar);
      const afterControlCount = countChar(afterText, controlChar);
      expect(afterControlCount).toBe(beforeControlCount);
    }

    const afterBoundaryLine = await superdoc.page.evaluate((linePmStart) => {
      const lineEl = Array.from(document.querySelectorAll('.superdoc-line')).find(
        (line) => line.getAttribute('data-pm-start') === linePmStart,
      ) as HTMLElement | undefined;
      if (!lineEl) return null;

      type CharBox = { char: string; centerX: number; centerY: number };
      const chars: CharBox[] = [];
      const doc = document;
      const walker = doc.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const text = node.textContent ?? '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (!ch || /\s/.test(ch)) continue;
          const range = doc.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            chars.push({ char: ch, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 });
          }
        }
        node = walker.nextNode() as Text | null;
      }
      if (chars.length === 0) return '';

      const centerY = chars.reduce((sum, c) => sum + c.centerY, 0) / chars.length;
      const band = chars.filter((c) => Math.abs(c.centerY - centerY) <= 6);
      const target = band.length > 0 ? band : chars;
      target.sort((a, b) => a.centerX - b.centerX);
      return target.map((c) => c.char).join('');
    }, boundaryChars?.linePmStart ?? null);

    if (
      boundaryChars?.visualSequence &&
      boundaryChars.visualLeftIndex >= 0 &&
      boundaryChars.visualLeftIndex < boundaryChars.visualSequence.length
    ) {
      const expectedSequence =
        boundaryChars.visualSequence.slice(0, boundaryChars.visualLeftIndex) +
        boundaryChars.visualSequence.slice(boundaryChars.visualLeftIndex + 1);
      expect(afterBoundaryLine).toBe(expectedSequence);
    }
  });
});
