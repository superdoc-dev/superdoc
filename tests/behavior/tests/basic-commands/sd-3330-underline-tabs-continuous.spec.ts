import { test, expect } from '../../fixtures/superdoc.js';

// SD-3330: typing a word, pressing Tab a few times, another word, selecting everything and
// applying underline must (1) underline the tab characters too - not only the text - and
// (2) paint a single continuous underline, not a text-decoration line under the words with a
// separate (and previously lower / broken) line under the tab gap.
test.use({ config: { layout: true } });

test('SD-3330: underlining text + tab stops yields one continuous underline', async ({ superdoc }) => {
  // Reproduce the exact reported interaction.
  await superdoc.type('Name');
  await superdoc.press('Tab');
  await superdoc.press('Tab');
  await superdoc.press('Tab');
  await superdoc.type('Value');
  await superdoc.waitForStable();

  await superdoc.selectAll();
  await superdoc.underline();
  await superdoc.waitForStable();

  // (1) Interaction: the underline mark landed on both words AND every tab. The original bug
  // was that tab characters could not be underlined - only text could.
  // Text underline goes through the document-api text helper (preferred). Tab-node marks are
  // not exposed by the text helpers, so the tab half reads ProseMirror state directly.
  await superdoc.assertTextHasMarks('Name', ['underline']);
  await superdoc.assertTextHasMarks('Value', ['underline']);

  const tabState = await superdoc.page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = (window as any).editor?.view;
    let tabCount = 0;
    let underlinedTabCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    view.state.doc.descendants((node: any) => {
      if (node.type?.name === 'tab') {
        tabCount += 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Array.isArray(node.marks) && node.marks.some((m: any) => m.type?.name === 'underline')) {
          underlinedTabCount += 1;
        }
      }
      return true;
    });
    return { tabCount, underlinedTabCount };
  });

  expect(tabState.tabCount).toBeGreaterThan(0);
  expect(tabState.underlinedTabCount).toBe(tabState.tabCount);

  // (2) Visual: the painted underline is one continuous mark. The line-level overlay owns the
  // underline, so no text run paints its own text-decoration and no tab paints its own border;
  // the overlay spans the content with no horizontal seam.
  const line = superdoc.page.locator('.superdoc-line').first();
  await expect(line.locator('.superdoc-underline-overlay').first()).toBeVisible();

  const paint = await line.evaluate((lineEl: HTMLElement) => {
    const spans = Array.from(lineEl.querySelectorAll('span')) as HTMLElement[];
    const borderedTabs = spans.filter((s) => {
      const cs = getComputedStyle(s);
      return cs.borderBottomStyle !== 'none' && cs.borderBottomWidth !== '0px';
    });
    const textWithDecoration = spans.filter((s) => {
      const cs = getComputedStyle(s);
      return (
        s.children.length === 0 &&
        (s.textContent || '').trim().length > 0 &&
        cs.textDecorationLine.includes('underline')
      );
    });
    const overlays = Array.from(lineEl.querySelectorAll('.superdoc-underline-overlay')) as HTMLElement[];
    const rects = overlays.map((o) => o.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    let maxGap = 0;
    let minTop = Infinity;
    let maxTop = -Infinity;
    for (let i = 0; i < rects.length; i += 1) {
      minTop = Math.min(minTop, rects[i].top);
      maxTop = Math.max(maxTop, rects[i].top);
      if (i > 0) maxGap = Math.max(maxGap, rects[i].left - rects[i - 1].right);
    }
    // Content extent = rendered text + tab spans (overlays are <div>, so the span query excludes them).
    const contentRects = spans.map((s) => s.getBoundingClientRect()).filter((r) => r.width > 0);
    const contentLeft = contentRects.length ? Math.min(...contentRects.map((r) => r.left)) : null;
    const contentRight = contentRects.length ? Math.max(...contentRects.map((r) => r.right)) : null;
    const overlayLeft = rects.length ? Math.min(...rects.map((r) => r.left)) : null;
    const overlayRight = rects.length ? Math.max(...rects.map((r) => r.right)) : null;
    return {
      overlayCount: overlays.length,
      borderedTabCount: borderedTabs.length,
      textDecorationCount: textWithDecoration.length,
      maxGapPx: rects.length ? maxGap : null,
      topSpreadPx: rects.length ? maxTop - minTop : null,
      contentLeft,
      contentRight,
      overlayLeft,
      overlayRight,
    };
  });

  // Overlay produced; native underline painters are suppressed where it owns the mark.
  expect(paint.overlayCount).toBeGreaterThan(0);
  expect(paint.borderedTabCount).toBe(0);
  expect(paint.textDecorationCount).toBe(0);
  // Continuous: overlay spans share one y (no vertical step) and have no horizontal gap.
  expect(paint.topSpreadPx).toBeLessThan(1);
  if (paint.maxGapPx !== null) {
    expect(paint.maxGapPx).toBeLessThan(2);
  }
  // Coverage: the overlay must span the full rendered content (Name -> tabs -> Value), not merely
  // exist. Without this, a degenerate "one tiny overlay + suppressed native painters" would pass.
  expect(paint.contentLeft).not.toBeNull();
  expect(paint.overlayLeft).not.toBeNull();
  expect(paint.overlayLeft as number).toBeLessThanOrEqual((paint.contentLeft as number) + 2);
  expect(paint.overlayRight as number).toBeGreaterThanOrEqual((paint.contentRight as number) - 2);
  const contentWidth = (paint.contentRight as number) - (paint.contentLeft as number);
  const overlayWidth = (paint.overlayRight as number) - (paint.overlayLeft as number);
  expect(overlayWidth).toBeGreaterThanOrEqual(contentWidth - 2);
});
