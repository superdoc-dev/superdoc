import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '../../fixtures/superdoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.join(__dirname, 'fixtures', 'two-column-simple.docx');

test.use({ config: { toolbar: 'full', showSelection: true } });

/**
 * Regression test for SD-2541 / IT-914: dragging a selection past the viewport
 * edge must not cause the viewport to bounce upward. Before the fix, every
 * pointermove-driven selection update re-armed scroll-into-view and scrolled
 * the editor's scroll container back toward the selection anchor, cancelling
 * auto-scroll progress.
 */
test('drag selection past viewport edge scrolls monotonically (SD-2541)', async ({ superdoc, page }) => {
  await superdoc.loadDocument(DOC_PATH);
  await superdoc.waitForStable();

  // Locate the scroll container and the first page's first text span.
  const startPoint = await page.evaluate(() => {
    const page0 = document.querySelector('[data-page-index="0"]') as HTMLElement | null;
    const span = page0?.querySelector('span') as HTMLElement | null;
    if (!span) return null;
    const r = span.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2 };
  });
  expect(startPoint, 'page 0 first span must exist').not.toBeNull();

  const scrollContainerSelector = '.dev-app__main';
  const holdPoint = await page.evaluate((sel) => {
    const sc = document.querySelector(sel) as HTMLElement | null;
    if (!sc) return null;
    const r = sc.getBoundingClientRect();
    // Hold a few pixels inside the bottom edge zone so auto-scroll ticks.
    return { x: r.left + 200, y: r.bottom - 8 };
  }, scrollContainerSelector);
  expect(holdPoint, 'scroll container must exist').not.toBeNull();

  const readScrollTop = () =>
    page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).scrollTop, scrollContainerSelector);

  const scrollTopBefore = await readScrollTop();

  // Start drag on page 0.
  await page.mouse.move(startPoint!.x, startPoint!.y);
  await page.mouse.down();

  // Move toward the bottom edge in a few steps so auto-scroll engages.
  await page.mouse.move(startPoint!.x, startPoint!.y + 120, { steps: 4 });
  await page.mouse.move(startPoint!.x, holdPoint!.y, { steps: 6 });

  // Hold at the edge and sample scrollTop repeatedly.
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(holdPoint!.x, holdPoint!.y);
    await page.waitForTimeout(60);
    samples.push(await readScrollTop());
  }

  await page.mouse.up();

  const scrollTopAfter = samples[samples.length - 1];

  // Must have actually scrolled down (auto-scroll is working).
  expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore + 100);

  // No bounce: no sample may drop meaningfully below the previous one.
  // Small sub-pixel noise can occur on some browsers, so allow a 1px slack.
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i] - samples[i - 1];
    expect(
      delta,
      `scrollTop bounced backward at sample ${i}: ${samples[i - 1]} → ${samples[i]} (Δ ${delta})`,
    ).toBeGreaterThanOrEqual(-1);
  }
});
