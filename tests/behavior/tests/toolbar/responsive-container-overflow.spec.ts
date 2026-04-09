import { test, expect } from '../../fixtures/superdoc.js';

/**
 * SD-2328 regression.
 *
 * When `modules.toolbar.responsiveToContainer` is on, overflow and compaction
 * must track the toolbar container's width, not the viewport. The bug this
 * guards: side panels shrink the toolbar container while the window stays
 * wide, and toolbar buttons spill past the container's right edge.
 *
 * The test keeps the viewport wide (1600px) on purpose so a viewport-driven
 * width read would leave the toolbar at full size. A container-driven read
 * must trigger compaction and overflow.
 */
test.use({ config: { toolbar: 'full', responsiveToContainer: true } });

test('toolbar buttons stay inside the container when it narrows (SD-2328)', async ({ superdoc }) => {
  const { page } = superdoc;

  await page.setViewportSize({ width: 1600, height: 900 });
  await superdoc.waitForStable();

  // Shrink only the container (mirrors the side-panel / drawer scenario).
  const containerWidth = 1100;
  await page.evaluate((w) => {
    const el = document.getElementById('toolbar');
    if (!el) throw new Error('#toolbar not found in harness');
    el.style.width = `${w}px`;
    el.style.maxWidth = `${w}px`;
  }, containerWidth);

  // Let the ResizeObserver fire through the 300ms throttle.
  await page.waitForTimeout(500);
  await superdoc.waitForStable();

  const result = await page.evaluate(() => {
    const container = document.getElementById('toolbar');
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const items = Array.from(container.querySelectorAll('.button-group > .toolbar-item-ctn'));
    const overflowing = items
      .map((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return {
          id: (el as HTMLElement).getAttribute('data-item-id') ?? '',
          right: rect.right,
          width: rect.width,
        };
      })
      // Skip zero-width items (collapsed / hidden by the overflow pipeline).
      .filter((entry) => entry.width > 0 && entry.right > containerRect.right + 1);
    const leftGroup = container.querySelector('.superdoc-toolbar-group-side .button-group');
    const leftGroupMinWidth = leftGroup ? getComputedStyle(leftGroup as Element).minWidth : null;
    return {
      containerRight: containerRect.right,
      containerWidth: containerRect.width,
      overflowing,
      leftGroupMinWidth,
    };
  });

  expect(result, 'harness toolbar container must exist').not.toBeNull();
  expect(result!.containerWidth).toBe(containerWidth);
  expect(
    result!.overflowing,
    `buttons must not extend past the toolbar container's right edge (container right = ${result!.containerRight}px)`,
  ).toEqual([]);
  // At 1100px (≤ lg = 1280) side groups must drop their 120px min-width so the
  // center group has room for the overflow menu. A 120px value here would mean
  // the container-width compaction path never ran.
  expect(result!.leftGroupMinWidth, 'side groups should compact at ≤ lg breakpoint').not.toBe('120px');
});
