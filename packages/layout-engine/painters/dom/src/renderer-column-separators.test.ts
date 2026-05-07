import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestPainter as createDomPainter } from './_test-utils.js';
import type { ColumnRegion, Fragment, Layout, Page } from '@superdoc/contracts';

// These tests pin down DomPainter's column-separator rendering:
//   - the fallback path (page.columns only, no mid-page regions)
//   - the region-aware path (page.columnRegions supersedes page.columns)
//   - the early-return guards inside renderColumnSeparators
//   - the content-presence gate: per Word's behavior, a separator is
//     suppressed when the column to its right is empty within the region.
// The layout-engine tests cover which data reaches the painter; these tests
// cover what the painter does with it.

// Minimal fragment factory for separator-presence assertions. We only need x
// (column placement) and y (region membership). The other fields are required
// by the contract but not read by renderColumnSeparators.
const fragAt = (x: number, y: number = 100): Fragment => ({
  kind: 'para',
  blockId: `frag-${x}-${y}`,
  fromLine: 0,
  toLine: 1,
  x,
  y,
  width: 100,
});

const buildPage = (overrides: Partial<Page> = {}): Page => ({
  number: 1,
  fragments: [],
  margins: { top: 96, right: 96, bottom: 96, left: 96 },
  ...overrides,
});

const buildLayout = (page: Page, pageSize = { w: 816, h: 1056 }): Layout => ({
  pageSize,
  pages: [page],
});

const querySeparators = (mount: HTMLElement): HTMLDivElement[] => {
  // Separators are the only 1px-wide absolutely-positioned divs added to a page.
  // Scoping by the inline styles keeps this brittle-free against unrelated
  // absolute-positioned overlays (rulers, selection, floats).
  return Array.from(mount.querySelectorAll('div')).filter((el) => {
    const s = el.style;
    return s.position === 'absolute' && s.width === '1px' && s.backgroundColor === '#000000';
  }) as HTMLDivElement[];
};

const paintOnce = (layout: Layout, mount: HTMLElement): void => {
  const painter = createDomPainter({ blocks: [], measures: [] });
  painter.paint(layout, mount);
};

describe('DomPainter renderColumnSeparators', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    mount = document.createElement('div');
    document.body.appendChild(mount);
  });

  afterEach(() => {
    mount.remove();
  });

  describe('fallback path (page.columns only)', () => {
    it('draws a single separator centered in the gap for 2 equal columns', () => {
      // 2 cols at x=96 and x=384 (96+288). Fragments in both → separator
      // gate is satisfied; the test pins down geometry, not the gate.
      const page = buildPage({
        columns: { count: 2, gap: 48, withSeparator: true },
        fragments: [fragAt(96), fragAt(432)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      // pageWidth=816, margins=96 → contentWidth=624, columnWidth=(624-48)/2=288.
      // separator x = leftMargin + columnWidth + gap/2 = 96 + 288 + 24 = 408.
      expect(seps[0].style.left).toBe('408px');
      expect(seps[0].style.top).toBe('96px');
      // height = pageHeight - top - bottom = 1056 - 96 - 96 = 864.
      expect(seps[0].style.height).toBe('864px');
    });

    it('draws count-1 separators for 3 equal columns', () => {
      const page = buildPage({
        columns: { count: 3, gap: 48, withSeparator: true },
        fragments: [fragAt(96), fragAt(320), fragAt(544)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(2);
      // columnWidth = (624 - 48*2) / 3 = 176.
      // sep 0: 96 + 176 + 48/2 = 296. sep 1: 96 + 2*176 + 48 + 48/2 = 520.
      expect(seps.map((s) => s.style.left)).toEqual(['296px', '520px']);
    });

    it('uses explicit column widths when drawing separators for page.columns', () => {
      const page = buildPage({
        columns: { count: 2, gap: 48, widths: [200, 952], equalWidth: false, withSeparator: true },
        fragments: [fragAt(96), fragAt(244)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      // contentWidth=624, availableWidth=576. Explicit widths [200, 952] are
      // normalized to [100, 476], so the separator belongs at 96 + 100 + 24 = 220.
      expect(seps[0].style.left).toBe('220px');
    });

    it('renders nothing when withSeparator is false', () => {
      const page = buildPage({ columns: { count: 2, gap: 48, withSeparator: false } });
      paintOnce(buildLayout(page), mount);

      expect(querySeparators(mount)).toHaveLength(0);
    });

    it('renders nothing when withSeparator is omitted (undefined)', () => {
      const page = buildPage({ columns: { count: 2, gap: 48 } });
      paintOnce(buildLayout(page), mount);

      expect(querySeparators(mount)).toHaveLength(0);
    });

    it('renders nothing for single-column pages', () => {
      const page = buildPage({ columns: { count: 1, gap: 0, withSeparator: true } });
      paintOnce(buildLayout(page), mount);

      expect(querySeparators(mount)).toHaveLength(0);
    });

    it('renders nothing when page has neither columns nor columnRegions', () => {
      paintOnce(buildLayout(buildPage()), mount);
      expect(querySeparators(mount)).toHaveLength(0);
    });

    it('renders nothing when page.margins is missing', () => {
      const page: Page = {
        number: 1,
        fragments: [],
        columns: { count: 2, gap: 48, withSeparator: true },
      };
      paintOnce(buildLayout(page), mount);
      expect(querySeparators(mount)).toHaveLength(0);
    });

    it('renders nothing when columnWidth collapses to <=1px', () => {
      // Pathological case: tiny page with a huge gap leaves no room for columns.
      const page = buildPage({
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
        columns: { count: 2, gap: 100, withSeparator: true },
      });
      paintOnce(buildLayout(page, { w: 110, h: 200 }), mount);
      // contentWidth=90, columnWidth=(90-100)/2=-5 → guard fires.
      expect(querySeparators(mount)).toHaveLength(0);
    });
  });

  describe('region-aware path (page.columnRegions)', () => {
    it('draws per-region separators bounded by each region yStart/yEnd', () => {
      const regions: ColumnRegion[] = [
        { yStart: 96, yEnd: 400, columns: { count: 2, gap: 48, withSeparator: true } },
        { yStart: 400, yEnd: 700, columns: { count: 3, gap: 48, withSeparator: true } },
      ];
      // page.columns is set to the first region's config (matches what the
      // layout engine does); the renderer must prefer columnRegions.
      const page = buildPage({
        columns: regions[0].columns,
        columnRegions: regions,
        // Region 0 has fragments in both 2-col positions; Region 1 has one
        // in each of three columns.
        fragments: [fragAt(96, 200), fragAt(432, 200), fragAt(96, 500), fragAt(320, 500), fragAt(544, 500)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      // Region 0: 1 separator for 2-col. Region 1: 2 separators for 3-col.
      expect(seps).toHaveLength(3);

      // Region 0 bounds.
      expect(seps[0].style.top).toBe('96px');
      expect(seps[0].style.height).toBe('304px'); // 400 - 96
      expect(seps[0].style.left).toBe('408px');

      // Region 1 bounds.
      expect(seps[1].style.top).toBe('400px');
      expect(seps[1].style.height).toBe('300px'); // 700 - 400
      expect(seps[2].style.top).toBe('400px');
      expect(seps[2].style.height).toBe('300px');
      // 3-col positions computed fresh for region 1: 296px and 520px.
      expect([seps[1].style.left, seps[2].style.left]).toEqual(['296px', '520px']);
    });

    it('skips regions whose withSeparator is false even if other regions render', () => {
      const regions: ColumnRegion[] = [
        { yStart: 96, yEnd: 400, columns: { count: 2, gap: 48, withSeparator: true } },
        { yStart: 400, yEnd: 700, columns: { count: 2, gap: 48, withSeparator: false } },
        { yStart: 700, yEnd: 960, columns: { count: 2, gap: 48, withSeparator: true } },
      ];
      const page = buildPage({
        columnRegions: regions,
        fragments: [
          fragAt(96, 200),
          fragAt(432, 200),
          fragAt(96, 500),
          fragAt(432, 500),
          fragAt(96, 800),
          fragAt(432, 800),
        ],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(2);
      // Only regions 0 and 2 produce output.
      expect(seps.map((s) => s.style.top)).toEqual(['96px', '700px']);
      expect(seps.map((s) => s.style.height)).toEqual(['304px', '260px']);
    });

    it('skips single-column regions', () => {
      const regions: ColumnRegion[] = [
        { yStart: 96, yEnd: 400, columns: { count: 1, gap: 0, withSeparator: true } },
        { yStart: 400, yEnd: 700, columns: { count: 2, gap: 48, withSeparator: true } },
      ];
      const page = buildPage({
        columnRegions: regions,
        fragments: [fragAt(96, 500), fragAt(432, 500)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.top).toBe('400px');
    });

    it('skips regions with non-positive height', () => {
      const regions: ColumnRegion[] = [
        { yStart: 96, yEnd: 96, columns: { count: 2, gap: 48, withSeparator: true } },
        { yStart: 96, yEnd: 500, columns: { count: 2, gap: 48, withSeparator: true } },
      ];
      const page = buildPage({
        columnRegions: regions,
        fragments: [fragAt(96, 200), fragAt(432, 200)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.height).toBe('404px');
    });

    it('prefers columnRegions over page.columns when both are present', () => {
      // page.columns says "no separator", but columnRegions says "draw one".
      // The regions should win — they represent the authoritative per-region
      // state, page.columns only represents the page-start config.
      const page = buildPage({
        columns: { count: 2, gap: 48, withSeparator: false },
        columnRegions: [{ yStart: 96, yEnd: 960, columns: { count: 2, gap: 48, withSeparator: true } }],
        fragments: [fragAt(96), fragAt(432)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.top).toBe('96px');
      expect(seps[0].style.height).toBe('864px');
    });

    it('uses explicit column widths when drawing separators for columnRegions', () => {
      const page = buildPage({
        columnRegions: [
          {
            yStart: 96,
            yEnd: 500,
            columns: { count: 2, gap: 48, widths: [200, 952], equalWidth: false, withSeparator: true },
          },
        ],
        fragments: [fragAt(96, 200), fragAt(244, 200)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.top).toBe('96px');
      expect(seps[0].style.height).toBe('404px');
      expect(seps[0].style.left).toBe('220px');
    });
  });

  // The content-presence gate matches Word: a column separator is suppressed
  // when the column to its right has no content within the region. This is
  // observable in `multi-column-sections.docx` page 2 — Word draws no line
  // because the section's content fits entirely in column 0.
  describe('content-presence gate', () => {
    it('suppresses the separator when no fragment sits past the column boundary', () => {
      const page = buildPage({
        columns: { count: 2, gap: 48, withSeparator: true },
        // Only column 0 has content (x=96 < separatorX=408). Word draws nothing.
        fragments: [fragAt(96), fragAt(96, 300)],
      });
      paintOnce(buildLayout(page), mount);

      expect(querySeparators(mount)).toHaveLength(0);
    });

    it('draws only the separator whose right neighbor has content (3-col, col 3 empty)', () => {
      // 3 cols at x=96, x=320, x=544. Separators at 296 and 520.
      // Cols 1 and 2 have content; col 3 is empty. Only the 296 separator
      // draws; the 520 separator (col 2 → col 3 boundary) is suppressed.
      const page = buildPage({
        columns: { count: 3, gap: 48, withSeparator: true },
        fragments: [fragAt(96), fragAt(320)],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.left).toBe('296px');
    });

    it('checks fragment presence within the region only, not the whole page', () => {
      // Region 0 (2-col): only col 0 has content → no separator.
      // Region 1 (2-col): both cols have content → separator drawn.
      // Without the y-bounded gate, region 0's separator would draw because
      // region 1's col-1 fragment exists somewhere on the page.
      const regions: ColumnRegion[] = [
        { yStart: 96, yEnd: 400, columns: { count: 2, gap: 48, withSeparator: true } },
        { yStart: 400, yEnd: 700, columns: { count: 2, gap: 48, withSeparator: true } },
      ];
      const page = buildPage({
        columnRegions: regions,
        fragments: [
          fragAt(96, 200), // region 0, col 0
          fragAt(96, 500), // region 1, col 0
          fragAt(432, 500), // region 1, col 1
        ],
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.top).toBe('400px');
      expect(seps[0].style.height).toBe('300px');
    });
  });
});
