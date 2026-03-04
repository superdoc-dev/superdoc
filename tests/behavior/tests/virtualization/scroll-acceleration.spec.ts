import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'none' } });

/**
 * Generate a long document with enough paragraphs to span many pages.
 * Returns the total paragraph count that was inserted.
 */
async function generateLongDocument(page: any, paragraphCount = 200): Promise<number> {
  await page.evaluate((count: number) => {
    const editor = (window as any).editor;
    const { state } = editor;
    const { schema } = state;

    const paragraphs: any[] = [];
    for (let i = 0; i < count; i++) {
      const text = schema.text(
        `Paragraph ${i + 1}. ` +
          'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
          'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
          'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
      );
      const run = schema.nodes.run.create(null, text);
      paragraphs.push(schema.nodes.paragraph.create(null, run));
    }

    const doc = schema.nodes.doc.create(null, paragraphs);
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    editor.view.dispatch(tr);
  }, paragraphCount);

  return paragraphCount;
}

/**
 * Find the scrollable container and return a handle for scroll operations.
 * Returns { scrollTop, scrollHeight, clientHeight } after optionally setting scrollTop.
 */
async function getScrollInfo(
  page: any,
  setScrollTop?: number,
): Promise<{
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}> {
  return page.evaluate((targetScrollTop: number | undefined) => {
    const mount = document.querySelector('.superdoc-viewport') ?? document.querySelector('#editor');
    let scrollable: HTMLElement | null = null;
    let el: HTMLElement | null = mount as HTMLElement;
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 10) {
        scrollable = el;
        break;
      }
      el = el.parentElement;
    }
    if (!scrollable) scrollable = document.documentElement;

    if (targetScrollTop !== undefined) {
      scrollable.scrollTop = targetScrollTop;
    }

    return {
      scrollTop: scrollable.scrollTop,
      scrollHeight: scrollable.scrollHeight,
      clientHeight: scrollable.clientHeight,
    };
  }, setScrollTop);
}

/**
 * Get the currently mounted page indices from the DOM.
 */
async function getMountedPageIndices(page: any): Promise<number[]> {
  return page.evaluate(() => {
    const pages = document.querySelectorAll('.superdoc-page[data-page-index]');
    return Array.from(pages)
      .map((p) => Number((p as HTMLElement).dataset.pageIndex))
      .sort((a, b) => a - b);
  });
}

test.describe('scroll virtualization stability', () => {
  test('incremental scroll does not jump ahead by more than a few pages', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const info = await getScrollInfo(superdoc.page);
    expect(info.scrollHeight).toBeGreaterThan(info.clientHeight * 5);

    // Scroll in small increments (simulating slow user scroll).
    // After each increment, verify mounted pages are near the expected position.
    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 1000;
    });

    let currentScroll = 0;
    const scrollStep = Math.floor(pageHeight * 0.8); // less than one page per step
    const maxSteps = 15;

    for (let step = 0; step < maxSteps; step++) {
      currentScroll += scrollStep;
      await getScrollInfo(superdoc.page, currentScroll);
      // Let the virtualization settle.
      await superdoc.waitForStable(300);

      const actualInfo = await getScrollInfo(superdoc.page);
      // The scroll position must not have run away.
      // Allow some tolerance for scroll anchoring adjustments, but it should
      // never jump more than 3 page heights from where we set it.
      const drift = Math.abs(actualInfo.scrollTop - currentScroll);
      expect(drift).toBeLessThan(pageHeight * 3);

      const mounted = await getMountedPageIndices(superdoc.page);
      expect(mounted.length).toBeGreaterThan(0);
    }
  });

  test('scroll to middle of document shows correct pages', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const info = await getScrollInfo(superdoc.page);
    const midScroll = Math.floor(info.scrollHeight / 2);

    // Scroll to the middle.
    await getScrollInfo(superdoc.page, midScroll);
    await superdoc.waitForStable(500);

    // Verify pages are mounted and include mid-document pages.
    const mounted = await getMountedPageIndices(superdoc.page);
    expect(mounted.length).toBeGreaterThan(0);

    // Mounted pages should be in the middle range, not at the start or end.
    const totalPages = await superdoc.page.evaluate(() => {
      // Total page count from the layout, not just mounted pages.
      const spacer = document.querySelector('[data-virtual-spacer="bottom"]') as HTMLElement;
      const topSpacer = document.querySelector('[data-virtual-spacer="top"]') as HTMLElement;
      const mountedPages = document.querySelectorAll('.superdoc-page[data-page-index]');
      const maxIndex = Math.max(...Array.from(mountedPages).map((p) => Number((p as HTMLElement).dataset.pageIndex)));
      // A rough heuristic: if spacers exist, there are more pages than mounted.
      if (spacer && topSpacer) {
        return maxIndex + 10; // at least this many
      }
      return maxIndex + 1;
    });

    const minMounted = Math.min(...mounted);
    const maxMounted = Math.max(...mounted);

    // The mounted pages should be roughly in the middle, not at position 0 or
    // at the very last page (which would indicate the scroll ran away).
    expect(minMounted).toBeGreaterThan(0);
    expect(maxMounted).toBeLessThan(totalPages - 1);
  });

  test('rapid small scrolls do not cause scroll position runaway', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 1000;
    });

    // Perform many small scrolls rapidly (simulate mousewheel).
    const smallStep = Math.floor(pageHeight / 5); // ~200px per step
    const steps = 30;
    let targetScroll = 0;

    for (let i = 0; i < steps; i++) {
      targetScroll += smallStep;
      await getScrollInfo(superdoc.page, targetScroll);
      // Minimal wait between scrolls to simulate rapid interaction.
      await superdoc.page.waitForTimeout(50);
    }

    // Let everything settle.
    await superdoc.waitForStable(500);

    const finalInfo = await getScrollInfo(superdoc.page);

    // The final scroll position should be near our target (within 3 pages).
    // If the feedback loop fires, scrollTop will be at or near scrollHeight
    // (the very bottom of the document).
    const maxAllowedScroll = targetScroll + pageHeight * 3;
    expect(finalInfo.scrollTop).toBeLessThan(maxAllowedScroll);

    // Specifically, it must NOT have scrolled to the bottom.
    const bottomThreshold = finalInfo.scrollHeight - finalInfo.clientHeight - pageHeight;
    expect(finalInfo.scrollTop).toBeLessThan(bottomThreshold);
  });

  test('virtual window shift preserves scroll stability', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 1000;
    });

    // Scroll to a position that will definitely trigger a virtual window shift
    // (past the initial window of ~5 pages).
    const targetScroll = pageHeight * 6;
    await getScrollInfo(superdoc.page, targetScroll);
    await superdoc.waitForStable(500);

    // Record position after first settle.
    const afterShift = await getScrollInfo(superdoc.page);

    // Wait a bit more for any cascading scroll events.
    await superdoc.page.waitForTimeout(300);
    const afterSettle = await getScrollInfo(superdoc.page);

    // The scroll position should be stable (no drift between the two reads).
    const drift = Math.abs(afterSettle.scrollTop - afterShift.scrollTop);
    expect(drift).toBeLessThan(pageHeight);
  });
});

test.describe('scroll stability with comments enabled', () => {
  // When comments: 'on', the harness passes modules.comments = { visible: true }.
  // This enables the comments sidebar UI and comment highlight rendering,
  // producing a different DOM layout than the default.
  const commentsTest = test.extend<{}>({});
  commentsTest.use({ config: { toolbar: 'none', comments: 'on' } });

  commentsTest('incremental scroll stable with comments on', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 1000;
    });

    const scrollStep = Math.floor(pageHeight * 0.8);
    let targetScroll = 0;

    for (let step = 0; step < 12; step++) {
      targetScroll += scrollStep;
      await getScrollInfo(superdoc.page, targetScroll);
      await superdoc.waitForStable(300);

      const actualInfo = await getScrollInfo(superdoc.page);
      const drift = Math.abs(actualInfo.scrollTop - targetScroll);
      expect(drift).toBeLessThan(pageHeight * 3);
    }

    const mounted = await getMountedPageIndices(superdoc.page);
    expect(mounted.length).toBeGreaterThan(0);
  });

  commentsTest('rapid scroll stable with comments on', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 1000;
    });

    const smallStep = Math.floor(pageHeight / 5);
    let targetScroll = 0;

    for (let i = 0; i < 25; i++) {
      targetScroll += smallStep;
      await getScrollInfo(superdoc.page, targetScroll);
      await superdoc.page.waitForTimeout(50);
    }

    await superdoc.waitForStable(500);
    const finalInfo = await getScrollInfo(superdoc.page);

    const bottomThreshold = finalInfo.scrollHeight - finalInfo.clientHeight - pageHeight;
    expect(finalInfo.scrollTop).toBeLessThan(bottomThreshold);
  });
});

test.describe('scroll stability at non-100% zoom', () => {
  test('scroll does not accelerate at 75% zoom', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    // Set zoom to 75%.
    await superdoc.page.evaluate(() => {
      (window as any).superdoc.setZoom(75);
    });
    await superdoc.waitForStable(1000);

    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 800;
    });

    // Scroll incrementally past the initial window.
    const scrollStep = Math.floor(pageHeight * 0.8);
    let targetScroll = 0;

    for (let step = 0; step < 12; step++) {
      targetScroll += scrollStep;
      await getScrollInfo(superdoc.page, targetScroll);
      await superdoc.waitForStable(200);
    }

    // Let settle.
    await superdoc.waitForStable(500);
    const finalInfo = await getScrollInfo(superdoc.page);

    // Must not have run away to the bottom.
    const maxAllowed = targetScroll + pageHeight * 3;
    expect(finalInfo.scrollTop).toBeLessThan(maxAllowed);

    // Must still have pages mounted.
    const mounted = await getMountedPageIndices(superdoc.page);
    expect(mounted.length).toBeGreaterThan(0);
  });

  test('scroll does not accelerate at 150% zoom', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    await superdoc.page.evaluate(() => {
      (window as any).superdoc.setZoom(150);
    });
    await superdoc.waitForStable(1000);

    const pageHeight = await superdoc.page.evaluate(() => {
      const page = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
      return page ? page.offsetHeight : 1500;
    });

    const scrollStep = Math.floor(pageHeight * 0.8);
    let targetScroll = 0;

    for (let step = 0; step < 10; step++) {
      targetScroll += scrollStep;
      await getScrollInfo(superdoc.page, targetScroll);
      await superdoc.waitForStable(200);
    }

    await superdoc.waitForStable(500);
    const finalInfo = await getScrollInfo(superdoc.page);

    const maxAllowed = targetScroll + pageHeight * 3;
    expect(finalInfo.scrollTop).toBeLessThan(maxAllowed);

    const mounted = await getMountedPageIndices(superdoc.page);
    expect(mounted.length).toBeGreaterThan(0);
  });
});
