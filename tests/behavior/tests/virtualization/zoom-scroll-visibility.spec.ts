import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'none' } });

test('content is visible at 75% zoom when scrolled to mid-document', async ({ superdoc }) => {
  // Generate a long document (~60 paragraphs) to span many pages and trigger virtualization.
  await superdoc.page.evaluate(() => {
    const editor = (window as any).editor;
    const { state } = editor;
    const { schema } = state;

    const paragraphs: any[] = [];
    for (let i = 0; i < 60; i++) {
      const text = schema.text(
        `Paragraph number ${i + 1}. ` +
          'This line contains enough text to be clearly visible when rendered ' +
          'in the paginated layout engine viewport.',
      );
      const run = schema.nodes.run.create(null, text);
      paragraphs.push(schema.nodes.paragraph.create(null, run));
    }

    const doc = schema.nodes.doc.create(null, paragraphs);
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    editor.view.dispatch(tr);
  });

  await superdoc.waitForStable(2000);

  // Verify multiple pages exist before proceeding.
  const initialPageCount = await superdoc.page.locator('.superdoc-page[data-page-index]').count();
  expect(initialPageCount).toBeGreaterThanOrEqual(3);

  // Set zoom to 75%.
  await superdoc.page.evaluate(() => {
    (window as any).superdoc.setZoom(75);
  });
  await superdoc.waitForStable(1000);

  // Scroll to mid-document.
  await superdoc.page.evaluate(() => {
    // Walk from the editor element up to find the scrollable ancestor.
    const editor = document.querySelector('.superdoc-viewport') ?? document.querySelector('#editor');
    let scrollable: HTMLElement | null = null;
    let el: HTMLElement | null = editor as HTMLElement;
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 10) {
        scrollable = el;
        break;
      }
      el = el.parentElement;
    }
    if (!scrollable) {
      scrollable = document.documentElement;
    }
    scrollable.scrollTop = Math.floor(scrollable.scrollHeight / 2);
  });

  await superdoc.waitForStable(1000);

  // Pages should be mounted in the DOM.
  const visiblePages = superdoc.page.locator('.superdoc-page[data-page-index]');
  await expect(visiblePages.first()).toBeAttached({ timeout: 5000 });

  // Mounted pages must contain visible content lines (not blank).
  const linesInView = superdoc.page.locator('.superdoc-page .superdoc-line');
  await expect(linesInView.first()).toBeAttached({ timeout: 5000 });
  const lineCount = await linesInView.count();
  expect(lineCount).toBeGreaterThan(0);

  // At least one line must have non-empty text.
  const hasVisibleText = await superdoc.page.evaluate(() => {
    const lines = document.querySelectorAll('.superdoc-page .superdoc-line');
    for (const line of lines) {
      if ((line.textContent ?? '').trim().length > 0) return true;
    }
    return false;
  });
  expect(hasVisibleText).toBe(true);

  // Mounted pages should include mid-document pages, not just the first page.
  const pageIndices = await superdoc.page.evaluate(() => {
    const pages = document.querySelectorAll('.superdoc-page[data-page-index]');
    return Array.from(pages).map((p) => Number((p as HTMLElement).dataset.pageIndex));
  });
  const maxPageIndex = Math.max(...pageIndices);
  expect(maxPageIndex).toBeGreaterThanOrEqual(1);
});
