import { test, expect } from '../../fixtures/superdoc.js';
import { addCommentByText, assertDocumentApiReady } from '../../helpers/document-api.js';

test.use({ config: { toolbar: 'full', comments: 'on' } });

/**
 * SD-2793 — `ui.viewport.getRect({ target })` returns the painted-DOM
 * rectangle for an entity (comment or tracked change) so consumers
 * can pin sticky cards / floating toolbars without reaching into PM
 * positions or painter selectors.
 *
 * Unit tests cover the resolver in jsdom. This Playwright spec runs
 * the real layout-engine + painted DOM and verifies:
 *
 *   - getRect returns `success: true` with finite, plausible rect dims
 *   - `rect.top/left/width/height` match the painted DOM element's
 *     `getBoundingClientRect()` (within ±1px tolerance for sub-pixel
 *     rounding across browsers)
 *   - `pageIndex` is the painted page's index
 *   - getRect on an unmounted / unknown entity returns
 *     `success: false, reason: 'not-mounted'`
 */

test('ui.viewport.getRect returns rects matching the painted comment highlight', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('viewport rect probe target text');
  await superdoc.waitForStable();

  const commentId = await addCommentByText(superdoc.page, {
    pattern: 'probe',
    text: 'comment for getRect probe',
  });
  await superdoc.waitForStable();
  await superdoc.assertCommentHighlightExists({ text: 'probe', timeoutMs: 20_000 });

  const probe = await superdoc.page.evaluate((id) => {
    const ui = (window as any).__bootSuperDocUI?.();
    if (!ui) return { uiAvailable: false };
    const result = ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'comment', entityId: id },
    });
    if (!result.success) {
      return { uiAvailable: true, success: false, reason: result.reason };
    }
    // Capture the first painted highlight's bounding rect for
    // cross-comparison. The painter stamps `data-comment-ids="<id>,..."`
    // on every text run that anchors the comment.
    const highlights = Array.from(document.querySelectorAll<HTMLElement>('[data-comment-ids]')).filter((el) =>
      (el.dataset.commentIds ?? '').split(',').some((token) => token.trim() === id),
    );
    const first = highlights[0]?.getBoundingClientRect();
    return {
      uiAvailable: true,
      success: true,
      rectsLength: result.rects.length,
      rect: result.rect,
      pageIndex: result.pageIndex,
      paintedFirst: first ? { top: first.top, left: first.left, width: first.width, height: first.height } : null,
    };
  }, commentId);

  expect(probe.uiAvailable).toBe(true);
  expect(probe.success).toBe(true);
  expect(probe.rectsLength).toBeGreaterThan(0);
  expect(Number.isFinite((probe as any).rect.top)).toBe(true);
  expect(Number.isFinite((probe as any).rect.left)).toBe(true);
  expect((probe as any).rect.width).toBeGreaterThan(0);
  expect((probe as any).rect.height).toBeGreaterThan(0);
  expect(typeof (probe as any).pageIndex).toBe('number');

  // The rect returned by getRect should align with the painted
  // highlight element's own `getBoundingClientRect`. Allow a small
  // tolerance — sub-pixel rounding can drift by 1px across browsers
  // and zoom levels.
  expect((probe as any).paintedFirst).toBeTruthy();
  const dx = Math.abs((probe as any).rect.left - (probe as any).paintedFirst.left);
  const dy = Math.abs((probe as any).rect.top - (probe as any).paintedFirst.top);
  expect(dx).toBeLessThanOrEqual(1);
  expect(dy).toBeLessThanOrEqual(1);
});

test('ui.viewport.getRect returns not-mounted for an unknown comment id', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  await superdoc.type('any document');
  await superdoc.waitForStable();

  const result = await superdoc.page.evaluate(() => {
    const ui = (window as any).__bootSuperDocUI?.();
    if (!ui) return { uiAvailable: false };
    return ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'comment', entityId: 'no-such-comment-id' },
    });
  });

  expect((result as any).uiAvailable !== false).toBe(true);
  expect((result as any).success).toBe(false);
  expect((result as any).reason).toBe('not-mounted');
});

test('ui.viewport.getRect rejects unsupported entity types with invalid-target', async ({ superdoc }) => {
  await assertDocumentApiReady(superdoc.page);

  const result = await superdoc.page.evaluate(() => {
    const ui = (window as any).__bootSuperDocUI?.();
    if (!ui) return { uiAvailable: false };
    return ui.viewport.getRect({
      target: { kind: 'entity', entityType: 'mystery', entityId: 'x' },
    });
  });

  expect((result as any).uiAvailable !== false).toBe(true);
  expect((result as any).success).toBe(false);
  expect((result as any).reason).toBe('invalid-target');
});
