import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDomPainter } from './index.js';
import type { FlowBlock, Measure, Layout, Fragment, PageMargins } from '@superdoc/contracts';

// Minimal paragraph block/measure to satisfy painter
const block: FlowBlock = {
  kind: 'paragraph',
  id: 'b1',
  runs: [{ text: 'x', fontFamily: 'Arial', fontSize: 16 }],
};
const measure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 10,
      ascent: 10,
      descent: 2,
      lineHeight: 14,
    },
  ],
  totalHeight: 14,
};

const makeLayout = (count: number): Layout => ({
  pageSize: { w: 400, h: 500 },
  pages: Array.from({ length: count }, (_, i) => ({ number: i + 1, fragments: [] })),
});

const drawingBlock: FlowBlock = {
  kind: 'drawing',
  id: 'drawing-0',
  drawingKind: 'vectorShape',
  geometry: { width: 80, height: 60, rotation: 0, flipH: false, flipV: false },
  shapeKind: 'rect',
};

const drawingMeasure: Measure = {
  kind: 'drawing',
  drawingKind: 'vectorShape',
  width: 80,
  height: 60,
  scale: 1,
  naturalWidth: 80,
  naturalHeight: 60,
  geometry: { width: 80, height: 60, rotation: 0, flipH: false, flipV: false },
};

const makeDrawingLayout = (count: number): Layout => ({
  pageSize: { w: 400, h: 500 },
  pages: Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    fragments: [
      {
        kind: 'drawing',
        blockId: drawingBlock.id,
        drawingKind: 'vectorShape',
        x: 60,
        y: 80,
        width: 80,
        height: 60,
        geometry: { width: 80, height: 60, rotation: 0, flipH: false, flipV: false },
        scale: 1,
        isAnchored: false,
      },
    ],
  })),
});

describe('DomPainter virtualization (vertical)', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    // Emulate a scroll container height
    Object.assign(mount.style, { height: '600px', overflow: 'auto' });
    document.body.appendChild(mount);
  });

  afterEach(() => {
    // Clean up appended mount to avoid leaking between tests
    mount.remove();
  });

  it('renders only a window of pages with spacers', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 5, overscan: 0, gap: 72, paddingTop: 0 },
    });

    const layout = makeLayout(20);
    painter.paint(layout, mount);

    const pages = mount.querySelectorAll('.superdoc-page');
    expect(pages.length).toBeLessThanOrEqual(5);

    // Expect spacer elements to exist
    const topSpacer = mount.querySelector('[data-virtual-spacer="top"]') as HTMLElement | null;
    const bottomSpacer = mount.querySelector('[data-virtual-spacer="bottom"]') as HTMLElement | null;
    expect(topSpacer).toBeTruthy();
    expect(bottomSpacer).toBeTruthy();
  });

  it('defaults virtualization gap to 72px when no gap is provided', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 2 },
    });

    const layout = makeLayout(3);
    painter.paint(layout, mount);

    // Outer container keeps gap at 0 because it includes spacer elements.
    expect(mount.style.gap).toBe('0px');
    // The inner virtual pages container carries the effective inter-page gap.
    const pagesContainer = mount.querySelector('[data-virtual-spacer="top"]')?.nextElementSibling as
      | HTMLElement
      | undefined;
    expect(pagesContainer?.style.gap).toBe('72px');
  });

  it('updates the window on scroll', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 5, overscan: 0, gap: 72, paddingTop: 0 },
    });
    const layout = makeLayout(10);
    painter.paint(layout, mount);

    const firstBefore = mount.querySelector('.superdoc-page') as HTMLElement | null;
    const firstIndexBefore = firstBefore ? Number(firstBefore.dataset.pageIndex) : -1;

    // Scroll roughly one page down
    mount.scrollTop = 500 + 72; // page height + gap
    mount.dispatchEvent(new Event('scroll'));

    const firstAfter = mount.querySelector('.superdoc-page') as HTMLElement | null;
    const firstIndexAfter = firstAfter ? Number(firstAfter.dataset.pageIndex) : -1;

    expect(firstIndexAfter).toBeGreaterThanOrEqual(firstIndexBefore);
  });

  it('restores block SDT label when a virtualized start fragment remounts', () => {
    Object.defineProperty(mount, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(mount, 'scrollHeight', { value: 12000, configurable: true });

    const sdtBlock: FlowBlock = {
      kind: 'paragraph',
      id: 'virtual-sdt-block',
      runs: [{ text: 'Virtual SDT', fontFamily: 'Arial', fontSize: 16, pmStart: 0, pmEnd: 11 }],
      attrs: {
        sdt: {
          type: 'structuredContent',
          scope: 'block',
          id: 'virtual-sdt-1',
          alias: 'Virtual Block Control',
        },
      },
    };

    const sdtMeasure: Measure = {
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 11,
          width: 90,
          ascent: 12,
          descent: 4,
          lineHeight: 20,
        },
      ],
      totalHeight: 20,
    };

    const sdtLayout: Layout = {
      pageSize: { w: 400, h: 500 },
      pages: Array.from({ length: 6 }, (_, i) => ({
        number: i + 1,
        fragments: [
          {
            kind: 'para',
            blockId: 'virtual-sdt-block',
            fromLine: 0,
            toLine: 1,
            x: 24,
            y: 24,
            width: 220,
            pmStart: 0,
            pmEnd: 11,
          },
        ],
      })),
    };

    const painter = createDomPainter({
      blocks: [sdtBlock],
      measures: [sdtMeasure],
      virtualization: { enabled: true, window: 1, overscan: 0, gap: 72, paddingTop: 0 },
    });

    painter.paint(sdtLayout, mount);

    const labelBefore = mount.querySelector(
      '.superdoc-page[data-page-index="0"] .superdoc-structured-content__label',
    ) as HTMLElement | null;
    expect(labelBefore).toBeTruthy();

    mount.scrollTop = 3 * (500 + 72);
    mount.dispatchEvent(new Event('scroll'));
    expect(mount.querySelector('.superdoc-page[data-page-index="0"]')).toBeNull();

    mount.scrollTop = 0;
    mount.dispatchEvent(new Event('scroll'));

    const remountedLabel = mount.querySelector(
      '.superdoc-page[data-page-index="0"] .superdoc-structured-content__label',
    ) as HTMLElement | null;
    expect(remountedLabel).toBeTruthy();
  });

  it('handles window size larger than total pages', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 10, overscan: 0, gap: 72, paddingTop: 0 },
    });
    const layout = makeLayout(3);
    painter.paint(layout, mount);

    const pages = mount.querySelectorAll('.superdoc-page');
    expect(pages.length).toBe(3);
  });

  it('handles single page document', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 5, overscan: 0, gap: 72, paddingTop: 0 },
    });
    const layout = makeLayout(1);
    painter.paint(layout, mount);

    const pages = mount.querySelectorAll('.superdoc-page');
    expect(pages.length).toBe(1);
  });

  it('maintains bounded DOM nodes with large document', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 5, overscan: 1, gap: 72, paddingTop: 0 },
    });
    const layout = makeLayout(100);
    painter.paint(layout, mount);

    const pages = mount.querySelectorAll('.superdoc-page');
    // Should render at most window + 2*overscan pages
    expect(pages.length).toBeLessThanOrEqual(7);
  });

  it('renders overscan pages correctly', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 3, overscan: 2, gap: 72, paddingTop: 0 },
    });
    const layout = makeLayout(20);
    painter.paint(layout, mount);

    const pages = mount.querySelectorAll('.superdoc-page');
    // With overscan=2, should render up to 3 + 2*2 = 7 pages
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.length).toBeLessThanOrEqual(7);
  });

  it('pins pages outside the scroll window', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      virtualization: { enabled: true, window: 2, overscan: 0, gap: 72, paddingTop: 0 },
    });

    const layout = makeLayout(12);
    painter.paint(layout, mount);

    expect(mount.querySelector('.superdoc-page[data-page-index="10"]')).toBeNull();

    painter.setVirtualizationPins?.([10]);

    expect(mount.querySelector('.superdoc-page[data-page-index="10"]')).toBeTruthy();

    const gapSpacer = mount.querySelector('[data-virtual-spacer="gap"]') as HTMLElement | null;
    expect(gapSpacer).toBeTruthy();
    expect(gapSpacer?.dataset.gapFrom).toBe('1');
    expect(gapSpacer?.dataset.gapTo).toBe('10');

    painter.setVirtualizationPins?.([]);

    expect(mount.querySelector('.superdoc-page[data-page-index="10"]')).toBeNull();
    expect(mount.querySelector('[data-virtual-spacer="gap"]')).toBeNull();
  });

  it('updates providers without remounting pages', () => {
    const painter = createDomPainter({
      blocks: [block],
      measures: [measure],
      // Use non-virtualized path to focus on provider update semantics
    });

    const layout = makeLayout(2);
    painter.paint(layout, mount);

    const firstPageBefore = mount.querySelector('.superdoc-page') as HTMLElement | null;
    expect(firstPageBefore).toBeTruthy();

    // Simple provider that renders one paragraph fragment in header and footer
    const headerProvider = (_pageNumber: number) => ({
      height: 20,
      offset: 0,
      fragments: [
        {
          kind: 'para',
          blockId: block.id,
          fromLine: 0,
          toLine: 1,
          x: 0,
          y: 0,
          width: 50,
        },
      ],
    });
    const footerProvider = (_pageNumber: number) => ({
      height: 20,
      offset: 0,
      fragments: [
        {
          kind: 'para',
          blockId: block.id,
          fromLine: 0,
          toLine: 1,
          x: 0,
          y: 0,
          width: 50,
        },
      ],
    });

    painter.setProviders?.(
      headerProvider as (pn: number, pm?: PageMargins) => { height: number; offset: number; fragments: Fragment[] },
      footerProvider as (pn: number, pm?: PageMargins) => { height: number; offset: number; fragments: Fragment[] },
    );
    painter.paint(layout, mount);

    const firstPageAfter = mount.querySelector('.superdoc-page') as HTMLElement | null;
    expect(firstPageAfter).toBe(firstPageBefore);

    const headerEl = firstPageAfter!.querySelector('.superdoc-page-header');
    const footerEl = firstPageAfter!.querySelector('.superdoc-page-footer');
    expect(headerEl).toBeTruthy();
    expect(footerEl).toBeTruthy();
  });

  it('renders drawing fragments inside virtualized windows', () => {
    const painter = createDomPainter({
      blocks: [drawingBlock],
      measures: [drawingMeasure],
      virtualization: { enabled: true, window: 2, overscan: 0, gap: 72, paddingTop: 0 },
    });
    const layout = makeDrawingLayout(6);
    painter.paint(layout, mount);

    const firstPage = mount.querySelector('.superdoc-page') as HTMLElement | null;
    expect(firstPage).toBeTruthy();
    const firstIndexBefore = firstPage ? Number(firstPage.dataset.pageIndex) : -1;
    expect(firstPage?.querySelector('.superdoc-drawing-fragment')).toBeTruthy();

    mount.scrollTop = 500 + 72;
    mount.dispatchEvent(new Event('scroll'));

    const firstPageAfter = mount.querySelector('.superdoc-page') as HTMLElement | null;
    expect(firstPageAfter).toBeTruthy();
    expect(firstPageAfter?.querySelector('.superdoc-drawing-fragment')).toBeTruthy();
    const firstIndexAfter = firstPageAfter ? Number(firstPageAfter.dataset.pageIndex) : -1;
    expect(firstIndexAfter).toBeGreaterThanOrEqual(firstIndexBefore);
  });
});
