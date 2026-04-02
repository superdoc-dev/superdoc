import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/tables/sd-2356-click-scroll-jump.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available');

test.use({ config: { toolbar: 'full' } });

async function getScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    let el: Element | null = document.querySelector('.superdoc-page[data-page-index]');
    while (el) {
      el = el.parentElement;
      if (
        el &&
        el.scrollHeight > el.clientHeight + 100 &&
        (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll')
      ) {
        return el.scrollTop;
      }
    }
    return window.scrollY;
  });
}

test('@behavior SD-2356: clicking page margin should not jump scroll position', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(3000);

  const page = superdoc.page;

  // Wait for multiple pages to be rendered
  await expect(page.locator('.superdoc-page[data-page-index]').first()).toBeVisible({
    timeout: 15_000,
  });
  const pageCount = await page.locator('.superdoc-page[data-page-index]').count();
  expect(pageCount).toBeGreaterThanOrEqual(3);

  // Step 1: Place the cursor at "This agreement dated" on page 2
  const textPos = await superdoc.findTextPos('This agreement dated');
  await superdoc.setTextSelection(textPos, textPos);
  await superdoc.waitForStable();

  const selBefore = await superdoc.getSelection();
  expect(selBefore.from).toBe(textPos);

  // Step 2: Scroll down so page 3 is visible, without moving the cursor
  const page3Index = 2;
  await page.evaluate((idx) => {
    const pages = document.querySelectorAll('.superdoc-page[data-page-index]');
    const page3 = pages[idx] as HTMLElement;
    if (!page3) throw new Error(`Page ${idx} not found`);
    page3.scrollIntoView({ block: 'start' });
  }, page3Index);
  await superdoc.waitForStable(500);

  const scrollBefore = await getScrollTop(page);

  // Step 3: Click on the top margin area of page 3 (above the header)
  const page3Locator = page.locator('.superdoc-page[data-page-index]').nth(page3Index);
  const page3Box = await page3Locator.boundingBox();
  expect(page3Box).not.toBeNull();

  await page.mouse.click(page3Box!.x + page3Box!.width / 2, page3Box!.y + 15);
  await superdoc.waitForStable(1000);

  const scrollAfter = await getScrollTop(page);
  const scrollDelta = Math.abs(scrollAfter - scrollBefore);
  expect(
    scrollDelta,
    `Scroll jumped by ${scrollDelta}px after clicking page margin — expected no significant scroll change`,
  ).toBeLessThan(100);
});

test('@behavior SD-2356: clicking into table area should not jump scroll position', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(3000);

  const page = superdoc.page;

  await expect(page.locator('.superdoc-page[data-page-index]').first()).toBeVisible({
    timeout: 15_000,
  });

  // Place cursor at start of page 2
  const textPos = await superdoc.findTextPos('This agreement dated');
  await superdoc.setTextSelection(textPos, textPos);
  await superdoc.waitForStable();

  // Scroll to make the definitions table visible
  const defsText = page.locator('text=DEFINITIONS AND INTERPRETATIONS').first();
  await defsText.scrollIntoViewIfNeeded();
  await superdoc.waitForStable(500);

  const scrollBefore = await getScrollTop(page);

  // Click into a table cell
  const tableCell = page.locator('text=Business Day').first();
  const cellBox = await tableCell.boundingBox();

  if (cellBox) {
    await page.mouse.click(cellBox.x + 5, cellBox.y + 5);
  } else {
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
  }
  await superdoc.waitForStable(1000);

  const scrollAfter = await getScrollTop(page);
  const scrollDelta = Math.abs(scrollAfter - scrollBefore);
  expect(
    scrollDelta,
    `Scroll jumped by ${scrollDelta}px after clicking table cell — expected no significant scroll change`,
  ).toBeLessThan(100);
});

test('@behavior SD-2356: clicking gap between paragraphs in table should not jump scroll', async ({ superdoc }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable(3000);

  const page = superdoc.page;

  await expect(page.locator('.superdoc-page[data-page-index]').first()).toBeVisible({
    timeout: 15_000,
  });

  // Step 1: Place cursor to the left of "company that will be owned in substantially the same"
  const targetText = 'company that will be owned in substantially the same';
  const textPos = await superdoc.findTextPos(targetText);
  await superdoc.setTextSelection(textPos, textPos);
  await superdoc.waitForStable();

  // Scroll so both text areas are visible
  const targetLocator = page.locator(`text=${targetText}`).first();
  await targetLocator.scrollIntoViewIfNeeded();
  await superdoc.waitForStable(500);

  // Step 2: Find the gap between the bullet paragraph ending with
  // "exchange of similar or better standing," and the paragraph starting
  // with "provided, however, that a transaction..." — both are in the same
  // table cell on page 5.
  const gapCoords = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let aboveRect: DOMRect | null = null;
    let belowRect: DOMRect | null = null;

    while (walker.nextNode()) {
      const text = walker.currentNode.textContent || '';
      // Match the visible (painted) instances — they have finite x coordinates
      if (text.includes('exchange of similar or better standing,')) {
        const el = walker.currentNode.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Skip hidden ProseMirror DOM (has negative x)
        if (rect.x < 0) continue;
        aboveRect = rect;
      }
      if (text.includes('provided, however, that a transaction')) {
        const el = walker.currentNode.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.x < 0) continue;
        belowRect = rect;
      }
    }

    if (!aboveRect || !belowRect) return null;

    return {
      gapY: (aboveRect.bottom + belowRect.top) / 2,
      gapX: aboveRect.left + 100,
      gapSize: belowRect.top - aboveRect.bottom,
    };
  });

  expect(gapCoords).not.toBeNull();
  expect(gapCoords!.gapSize).toBeGreaterThan(0);

  const scrollBefore = await getScrollTop(page);
  const selBeforeClick = await superdoc.getSelection();

  // Instrument dispatch to trace the selection change and scroll
  const debugLogs: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('SD-2356')) debugLogs.push(msg.text());
  });
  // Check what elementsFromPoint returns at the gap — this is what clickToPositionDom uses
  const domDebug = await page.evaluate(
    ({ x, y }) => {
      const elements = document.elementsFromPoint(x, y);
      return elements.slice(0, 10).map((el) => ({
        tag: el.tagName,
        className: el.className?.toString()?.substring(0, 50),
        pmStart: (el as HTMLElement).dataset?.pmStart,
        pmEnd: (el as HTMLElement).dataset?.pmEnd,
        blockId: (el as HTMLElement).dataset?.blockId,
        isFragment: el.classList.contains('superdoc-fragment') || el.classList.contains('superdoc-table-fragment'),
        isLine: !!(el as HTMLElement).dataset?.pmStart && !!(el as HTMLElement).dataset?.pmEnd,
      }));
    },
    { x: gapCoords!.gapX, y: gapCoords!.gapY },
  );
  console.log('DOM hit chain:', JSON.stringify(domDebug, null, 2));

  // Monkey-patch the position hit resolver to trace which path returns the result
  await page.evaluate(() => {
    // Patch clickToPositionDom by intercepting the ViewportHost's pointer events
    // We can't easily patch the module functions, but we can instrument the dispatch
    const editor = (window as any).editor;
    if (!editor?.view) return;
    const origDispatch = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = function (tr: any) {
      if (tr.selectionSet) {
        const pos = tr.selection.from;
        const resolved = tr.doc.resolve(pos);
        const parentText = resolved.parent?.textContent?.substring(0, 80);
        const stack = new Error().stack
          ?.split('\n')
          .slice(1, 10)
          .map((l: string) => l.trim())
          .join(' | ');
        console.log(
          '[SD-2356] dispatch',
          JSON.stringify({
            from: pos,
            to: tr.selection.to,
            parentText,
            stack,
          }),
        );
      }
      return origDispatch(tr);
    };
  });

  // Check what element/fragment is at the click point
  const hitDebug = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { error: 'no element' };
      const blockEl = el.closest('[data-block-id]');
      const pageEl = el.closest('.superdoc-page');
      return {
        tag: el.tagName,
        className: el.className?.toString()?.substring(0, 40),
        blockId: blockEl?.getAttribute('data-block-id'),
        pageIndex: pageEl?.getAttribute('data-page-index'),
        hasPmStart: el.hasAttribute?.('data-pm-start'),
        closestPmStart: el.closest('[data-pm-start]')?.getAttribute('data-pm-start'),
      };
    },
    { x: gapCoords!.gapX, y: gapCoords!.gapY },
  );
  console.log('Hit debug:', JSON.stringify(hitDebug));

  await page.mouse.click(gapCoords!.gapX, gapCoords!.gapY);
  await superdoc.waitForStable(1000);

  const scrollAfter = await getScrollTop(page);
  const selAfterClick = await superdoc.getSelection();
  const scrollDelta = Math.abs(scrollAfter - scrollBefore);

  console.log(
    'Debug:',
    JSON.stringify({
      selBefore: selBeforeClick,
      selAfter: selAfterClick,
      scrollBefore,
      scrollAfter,
      scrollDelta,
    }),
  );
  for (const log of debugLogs) console.log(log);

  expect(
    scrollDelta,
    `Scroll jumped by ${scrollDelta}px after clicking paragraph gap — expected no significant scroll change`,
  ).toBeLessThan(100);
});
