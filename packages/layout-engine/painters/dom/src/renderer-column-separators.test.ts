import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDomPainter } from './index.js';
import type { ColumnRegion, Layout, Page } from '@superdoc/contracts';

// These tests pin down DomPainter's column-separator rendering:
//   - the fallback path (page.columns only, no mid-page regions)
//   - the region-aware path (page.columnRegions supersedes page.columns)
//   - all five early-return guards inside renderColumnSeparators
// The layout-engine tests cover which data reaches the painter; these tests
// cover what the painter does with it.

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
      const page = buildPage({ columns: { count: 2, gap: 48, withSeparator: true } });
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
      const page = buildPage({ columns: { count: 3, gap: 48, withSeparator: true } });
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
      const page = buildPage({ columnRegions: regions });
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
      const page = buildPage({ columnRegions: regions });
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
      const page = buildPage({ columnRegions: regions });
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
      });
      paintOnce(buildLayout(page), mount);

      const seps = querySeparators(mount);
      expect(seps).toHaveLength(1);
      expect(seps[0].style.top).toBe('96px');
      expect(seps[0].style.height).toBe('404px');
      expect(seps[0].style.left).toBe('220px');
    });
  });
});
