import { test, expect } from '../../fixtures/superdoc.js';

test.use({ config: { toolbar: 'none', previewScroll: true, blockPreviewScrollEvents: true } });

async function generateLongDocument(page: any, paragraphCount = 200): Promise<void> {
  await page.evaluate((count: number) => {
    const editor = (window as any).editor;
    const { state } = editor;
    const { schema } = state;

    const paragraphs: any[] = [];
    for (let i = 0; i < count; i++) {
      const text = schema.text(
        `SD-3230 paragraph ${i + 1}. ` +
          'This document is intentionally long enough to require a virtualized page window. ' +
          'The visible pages should update when the scroll owner moves.',
      );
      const run = schema.nodes.run.create(null, text);
      paragraphs.push(schema.nodes.paragraph.create(null, run));
    }

    const doc = schema.nodes.doc.create(null, paragraphs);
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    editor.view.dispatch(tr);
  }, paragraphCount);
}

async function jumpPastInitialVirtualWindow(page: any): Promise<void> {
  await page.evaluate(() => {
    const editor = document.querySelector('.superdoc-viewport') ?? document.querySelector('#editor');
    let scrollOwner: HTMLElement | null = editor as HTMLElement;

    while (scrollOwner && scrollOwner !== document.documentElement) {
      if (scrollOwner.scrollHeight > scrollOwner.clientHeight + 10) break;
      scrollOwner = scrollOwner.parentElement;
    }

    if (!scrollOwner || scrollOwner === document.documentElement) {
      throw new Error('Expected a SuperDoc scroll owner for the virtualization regression test.');
    }

    scrollOwner.scrollTop = Math.floor(scrollOwner.clientHeight * 8);
  });
}

async function getVirtualizedViewportState(page: any): Promise<{
  scrollTop: number;
  mountedPages: number[];
  visibleText: string;
}> {
  return page.evaluate(() => {
    const editor = document.querySelector('.superdoc-viewport') ?? document.querySelector('#editor');
    let scrollOwner: HTMLElement | null = editor as HTMLElement;

    while (scrollOwner && scrollOwner !== document.documentElement) {
      if (scrollOwner.scrollHeight > scrollOwner.clientHeight + 10) break;
      scrollOwner = scrollOwner.parentElement;
    }

    if (!scrollOwner || scrollOwner === document.documentElement) {
      throw new Error('Expected a SuperDoc scroll owner for the virtualization regression test.');
    }

    const mountedPages = Array.from(document.querySelectorAll('.superdoc-page[data-page-index]'))
      .map((pageEl) => Number((pageEl as HTMLElement).dataset.pageIndex))
      .sort((a, b) => a - b);

    const ownerRect = scrollOwner.getBoundingClientRect();
    const visibleText = Array.from(document.querySelectorAll('.superdoc-page[data-page-index]'))
      .filter((pageEl) => {
        const rect = pageEl.getBoundingClientRect();
        return rect.bottom > ownerRect.top && rect.top < ownerRect.bottom;
      })
      .map((pageEl) => pageEl.textContent?.trim() ?? '')
      .join('\n')
      .trim();

    return {
      scrollTop: scrollOwner.scrollTop,
      mountedPages,
      visibleText,
    };
  });
}

test('virtualized pages follow a host scroll owner that stops scroll propagation', async ({ superdoc }) => {
  await generateLongDocument(superdoc.page);
  await superdoc.waitForStable(2000);

  await jumpPastInitialVirtualWindow(superdoc.page);
  await superdoc.waitForStable(500);

  const state = await getVirtualizedViewportState(superdoc.page);

  expect(state.scrollTop).toBeGreaterThan(0);
  expect(Math.min(...state.mountedPages)).toBeGreaterThan(0);
  expect(state.visibleText).toContain('SD-3230 paragraph');
});
