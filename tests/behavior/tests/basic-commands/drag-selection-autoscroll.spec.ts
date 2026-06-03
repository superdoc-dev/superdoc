import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(__dirname, '../../test-data/pagination/h_f-normal-odd-even.docx');

test.skip(!fs.existsSync(DOC_PATH), 'Test document not available — run pnpm corpus:pull');

test.use({ config: { toolbar: 'full', showSelection: true } });

const EDITOR_VIEWPORT_HEIGHT_PX = 700;
const DRAG_START_OFFSET_X = 120;
const DRAG_START_OFFSET_Y = 140;
const DRAG_EDGE_OFFSET_X = 260;
const DRAG_INSIDE_EDGE_OFFSET_Y = 10;
const DRAG_OUTSIDE_EDGE_OFFSET_Y = 120;
const DRAG_TO_EDGE_STEPS = 18;
const DRAG_OUTSIDE_STEPS = 10;
const HOLD_EDGE_ITERATIONS = 6;
const HOLD_EDGE_STEPS = 2;
const HOLD_EDGE_WAIT_MS = 200;

test('drag selection near viewport edge autoscrolls the editor', async ({ superdoc, browserName }) => {
  // Firefox headless does not consistently surface drag-triggered autoscroll in this harness.
  test.skip(browserName === 'firefox', 'Drag-triggered autoscroll is not deterministic in Firefox headless.');

  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  await superdoc.page.evaluate((heightPx) => {
    const editor = document.querySelector('#editor') as HTMLElement | null;
    if (!editor) return;
    // Constrain viewport so multi-page docs require scrolling in all browsers.
    editor.style.height = `${heightPx}px`;
    editor.style.maxHeight = `${heightPx}px`;
    editor.style.overflowY = 'auto';
  }, EDITOR_VIEWPORT_HEIGHT_PX);
  await superdoc.waitForStable();

  const editor = superdoc.page.locator('#editor');
  const editorBox = await editor.boundingBox();
  if (!editorBox) throw new Error('Editor container is not visible.');
  await expect.poll(() => superdoc.page.locator('.superdoc-page[data-page-index]').count()).toBeGreaterThanOrEqual(2);

  const getScrollSignal = () =>
    superdoc.page.evaluate(() => {
      const maxElementScrollTop = Array.from(document.querySelectorAll('*')).reduce((max, node) => {
        const el = node as HTMLElement;
        if (el.scrollHeight <= el.clientHeight + 1) return max;
        return Math.max(max, el.scrollTop);
      }, 0);

      return {
        maxElementScrollTop,
        windowScrollY: window.scrollY,
      };
    });

  const startX = editorBox.x + DRAG_START_OFFSET_X;
  const startY = editorBox.y + DRAG_START_OFFSET_Y;
  const edgeX = editorBox.x + DRAG_EDGE_OFFSET_X;
  const insideEdgeY = editorBox.y + editorBox.height - DRAG_INSIDE_EDGE_OFFSET_Y;
  const outsideEdgeY = editorBox.y + editorBox.height + DRAG_OUTSIDE_EDGE_OFFSET_Y;

  // Drag toward and then past the bottom edge while holding selection to trigger auto-scroll.
  const scrollBefore = await getScrollSignal();
  await superdoc.page.mouse.move(startX, startY);
  await superdoc.page.mouse.down();
  await superdoc.page.mouse.move(edgeX, insideEdgeY, { steps: DRAG_TO_EDGE_STEPS });
  await superdoc.page.mouse.move(edgeX, outsideEdgeY, { steps: DRAG_OUTSIDE_STEPS });
  for (let i = 0; i < HOLD_EDGE_ITERATIONS; i += 1) {
    await superdoc.page.mouse.move(edgeX, outsideEdgeY, { steps: HOLD_EDGE_STEPS });
    await superdoc.waitForStable(HOLD_EDGE_WAIT_MS);
  }
  await superdoc.page.mouse.up();
  await superdoc.waitForStable();

  const scrollAfter = await getScrollSignal();
  const didScroll =
    scrollAfter.maxElementScrollTop > scrollBefore.maxElementScrollTop ||
    scrollAfter.windowScrollY > scrollBefore.windowScrollY;

  const selectionAfter = await superdoc.getSelection();
  const selectionSpan = Math.abs(selectionAfter.to - selectionAfter.from);
  expect(selectionSpan).toBeGreaterThan(0);
  expect(didScroll).toBe(true);
});
