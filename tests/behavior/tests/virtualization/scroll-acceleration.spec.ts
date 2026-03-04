import { test, expect, type SuperDocFixture } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'none' } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateLongDocument(page: any, paragraphCount = 200): Promise<void> {
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
}

/** Read scroll container metrics without mutating. */
async function getScrollInfo(page: any): Promise<{
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}> {
  return page.evaluate(() => {
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
    return {
      scrollTop: scrollable.scrollTop,
      scrollHeight: scrollable.scrollHeight,
      clientHeight: scrollable.clientHeight,
    };
  });
}

/** Set scrollTop on the scroll container. */
async function setScrollTop(page: any, value: number): Promise<void> {
  await page.evaluate((v: number) => {
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
    scrollable.scrollTop = v;
  }, value);
}

async function getPageHeight(page: any): Promise<number> {
  return page.evaluate(() => {
    const p = document.querySelector('.superdoc-page[data-page-index]') as HTMLElement;
    return p ? p.offsetHeight : 1000;
  });
}

async function getMountedPageIndices(page: any): Promise<number[]> {
  return page.evaluate(() => {
    const pages = document.querySelectorAll('.superdoc-page[data-page-index]');
    return Array.from(pages)
      .map((p) => Number((p as HTMLElement).dataset.pageIndex))
      .sort((a, b) => a - b);
  });
}

// ---------------------------------------------------------------------------
// Shared test patterns (called from multiple describe blocks)
// ---------------------------------------------------------------------------

/** Scroll incrementally and assert scroll position doesn't run away. */
async function assertIncrementalScrollStable(superdoc: SuperDocFixture, steps = 12): Promise<void> {
  const pageHeight = await getPageHeight(superdoc.page);
  const scrollStep = Math.floor(pageHeight * 0.8);
  let targetScroll = 0;

  for (let step = 0; step < steps; step++) {
    targetScroll += scrollStep;
    await setScrollTop(superdoc.page, targetScroll);
    await superdoc.waitForStable(300);

    const info = await getScrollInfo(superdoc.page);
    const drift = Math.abs(info.scrollTop - targetScroll);
    expect(drift).toBeLessThan(pageHeight * 3);
  }

  const mounted = await getMountedPageIndices(superdoc.page);
  expect(mounted.length).toBeGreaterThan(0);
}

/** Fire many rapid small scrolls and assert position didn't rocket to the bottom. */
async function assertRapidScrollStable(superdoc: SuperDocFixture, steps = 25): Promise<void> {
  const pageHeight = await getPageHeight(superdoc.page);
  const smallStep = Math.floor(pageHeight / 5);
  let targetScroll = 0;

  for (let i = 0; i < steps; i++) {
    targetScroll += smallStep;
    await setScrollTop(superdoc.page, targetScroll);
    await superdoc.waitForStable(50);
  }

  await superdoc.waitForStable(500);
  const info = await getScrollInfo(superdoc.page);

  const bottomThreshold = info.scrollHeight - info.clientHeight - pageHeight;
  expect(info.scrollTop).toBeLessThan(bottomThreshold);
}

/** Set zoom, scroll incrementally, and assert stability. */
async function assertScrollStableAtZoom(superdoc: SuperDocFixture, zoom: number): Promise<void> {
  await superdoc.page.evaluate((z: number) => {
    (window as any).superdoc.setZoom(z);
  }, zoom);
  await superdoc.waitForStable(1000);

  await assertIncrementalScrollStable(superdoc);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('scroll virtualization stability', () => {
  test('incremental scroll does not jump ahead', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const info = await getScrollInfo(superdoc.page);
    expect(info.scrollHeight).toBeGreaterThan(info.clientHeight * 5);

    await assertIncrementalScrollStable(superdoc, 15);
  });

  test('scroll to middle of document shows mid-range pages', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const info = await getScrollInfo(superdoc.page);
    await setScrollTop(superdoc.page, Math.floor(info.scrollHeight / 2));
    await superdoc.waitForStable(500);

    const mounted = await getMountedPageIndices(superdoc.page);
    expect(mounted.length).toBeGreaterThan(0);
    expect(Math.min(...mounted)).toBeGreaterThan(0);
  });

  test('rapid small scrolls do not cause runaway', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    await assertRapidScrollStable(superdoc, 30);
  });

  test('virtual window shift preserves scroll stability', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);

    const pageHeight = await getPageHeight(superdoc.page);

    // Scroll past the initial virtual window (~5 pages) to trigger a shift.
    await setScrollTop(superdoc.page, pageHeight * 6);
    await superdoc.waitForStable(500);

    const afterShift = await getScrollInfo(superdoc.page);

    // Wait for any cascading scroll events to settle.
    await superdoc.waitForStable(300);
    const afterSettle = await getScrollInfo(superdoc.page);

    const drift = Math.abs(afterSettle.scrollTop - afterShift.scrollTop);
    expect(drift).toBeLessThan(pageHeight);
  });
});

test.describe('scroll stability with comments enabled', () => {
  test.use({ config: { toolbar: 'none', comments: 'on' } });

  test('incremental scroll stable with comments on', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertIncrementalScrollStable(superdoc);
  });

  test('rapid scroll stable with comments on', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertRapidScrollStable(superdoc);
  });
});

test.describe('scroll stability with comments disabled (modules.comments: false)', () => {
  test.use({ config: { toolbar: 'none', comments: 'disabled' } });

  test('incremental scroll stable with comments: false', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertIncrementalScrollStable(superdoc);
  });

  test('rapid scroll stable with comments: false', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertRapidScrollStable(superdoc);
  });

  test('scroll at 75% zoom with comments: false', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertScrollStableAtZoom(superdoc, 75);
  });
});

test.describe('scroll stability at non-100% zoom', () => {
  test('scroll does not accelerate at 75% zoom', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertScrollStableAtZoom(superdoc, 75);
  });

  test('scroll does not accelerate at 150% zoom', async ({ superdoc }) => {
    await generateLongDocument(superdoc.page);
    await superdoc.waitForStable(2000);
    await assertScrollStableAtZoom(superdoc, 150);
  });
});
