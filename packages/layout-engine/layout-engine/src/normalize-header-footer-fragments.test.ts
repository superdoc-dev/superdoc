import { describe, expect, it } from 'vitest';
import type { FlowBlock, Fragment, Measure } from '@superdoc/contracts';
import { normalizeFragmentsForRegion } from './normalize-header-footer-fragments.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParaFragment(blockId: string, y: number): Fragment {
  return { kind: 'para', blockId, x: 0, y, fromLine: 0, toLine: 1 } as Fragment;
}

function makeAnchoredImageFragment(blockId: string, y: number, height: number, width = 0): Fragment {
  return { kind: 'image', blockId, x: 0, y, width, height, isAnchored: true } as unknown as Fragment;
}

function makeDummyMeasure(): Measure {
  return { kind: 'paragraph', lines: [], totalHeight: 0 } as Measure;
}

const PAGE_HEIGHT = 1056;
const MARGIN_BOTTOM = 72;
const FOOTER_DISTANCE = 36;

const fullConstraints = {
  pageWidth: 816,
  pageHeight: PAGE_HEIGHT,
  margins: { left: 72, right: 72, top: 72, bottom: MARGIN_BOTTOM, header: 36, footer: FOOTER_DISTANCE },
};

const FOOTER_BAND_ORIGIN = PAGE_HEIGHT - FOOTER_DISTANCE; // 1020

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeFragmentsForRegion (header/footer page-relative anchors)', () => {
  describe('page-relative anchors in header', () => {
    it('normalizes centered page-relative anchors against the physical page', () => {
      const imgWidth = 762.24;
      const imgHeight = 1010.88;
      const block: FlowBlock = {
        kind: 'image',
        id: 'header-background',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'center',
          vRelativeFrom: 'page',
          alignV: 'center',
          offsetH: 0,
          offsetV: 0,
        },
      };
      const fragment = makeAnchoredImageFragment('header-background', 0, imgHeight, imgWidth);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.x).toBeCloseTo((816 - imgWidth) / 2);
      expect(fragment.y).toBeCloseTo((PAGE_HEIGHT - imgHeight) / 2);
    });

    it('normalizes right-aligned page-relative anchors against the physical page', () => {
      const imgWidth = 120;
      const block: FlowBlock = {
        kind: 'image',
        id: 'header-logo',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'right',
          vRelativeFrom: 'page',
          alignV: 'top',
          offsetH: 12,
        },
      };
      const fragment = makeAnchoredImageFragment('header-logo', 0, 40, imgWidth);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.x).toBe(816 - imgWidth - 12);
    });

    it('normalizes left page-relative anchors with explicit offsets', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'header-left-offset',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'left',
          vRelativeFrom: 'page',
          alignV: 'top',
          offsetH: 24,
        },
      };
      const fragment = makeAnchoredImageFragment('header-left-offset', 0, 40, 120);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.x).toBe(24);
    });

    it('normalizes column-relative X using the physical page margin when Y is page-relative', () => {
      const imgWidth = 830;
      const block: FlowBlock = {
        kind: 'image',
        id: 'header-column-background',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'column',
          offsetH: -76,
          vRelativeFrom: 'page',
          alignV: 'top',
          offsetV: 8,
        },
      };
      const fragment = makeAnchoredImageFragment('header-column-background', 0, 40, imgWidth);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.x).toBe(-4);
      expect(fragment.y).toBe(8);
    });
  });

  describe('page-relative anchors in footer', () => {
    it('normalizes a top-aligned anchor', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, 50);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      // physicalY = 0, bandOrigin = 1020
      expect(fragment.y).toBe(0 - FOOTER_BAND_ORIGIN);
    });

    it('normalizes a bottom-aligned anchor', () => {
      const imgHeight = 50;
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'bottom', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, imgHeight);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      // physicalY = 1056 - 50 = 1006, bandOrigin = 1020
      expect(fragment.y).toBe(PAGE_HEIGHT - imgHeight - FOOTER_BAND_ORIGIN);
    });

    it('normalizes a center-aligned anchor', () => {
      const imgHeight = 40;
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'center', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, imgHeight);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      // physicalY = (1056 - 40) / 2 = 508, bandOrigin = 1020
      expect(fragment.y).toBe((PAGE_HEIGHT - imgHeight) / 2 - FOOTER_BAND_ORIGIN);
    });

    it('normalizes footer X when the vertical anchor uses page coordinates', () => {
      const imgWidth = 120;
      const block: FlowBlock = {
        kind: 'image',
        id: 'footer-centered',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'center',
          vRelativeFrom: 'page',
          alignV: 'bottom',
          offsetV: 0,
        },
      };
      const fragment = makeAnchoredImageFragment('footer-centered', 0, 40, imgWidth);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.x).toBe((816 - imgWidth) / 2);
      expect(fragment.y).toBe(PAGE_HEIGHT - 40 - FOOTER_BAND_ORIGIN);
    });

    it('does not rewrite page-relative X when the vertical anchor is not page-relative', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'footer-cross-axis',
        src: 'test.png',
        anchor: {
          isAnchored: true,
          hRelativeFrom: 'page',
          alignH: 'center',
          vRelativeFrom: 'paragraph',
          offsetV: 0,
        },
      };
      const fragment = makeAnchoredImageFragment('footer-cross-axis', 12, 40, 120);
      fragment.x = 24;
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.x).toBe(24);
      expect(fragment.y).toBe(12);
    });

    it('applies offsetV correctly', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 20 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, 50);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      // physicalY = 20, bandOrigin = 1020
      expect(fragment.y).toBe(20 - FOOTER_BAND_ORIGIN);
    });

    it('normalizes drawing blocks the same as image blocks', () => {
      const block: FlowBlock = {
        kind: 'drawing',
        id: 'draw-1',
        drawingKind: 'vectorShape',
        geometry: { width: 100, height: 50 },
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'bottom', offsetV: 0 },
        shapeKind: 'Rectangle',
      };
      const fragment = {
        kind: 'drawing',
        blockId: 'draw-1',
        x: 0,
        y: 999,
        height: 50,
        isAnchored: true,
      } as unknown as Fragment;
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBe(PAGE_HEIGHT - 50 - FOOTER_BAND_ORIGIN);
    });

    it('falls back to bottom margin when footer distance is missing', () => {
      const imgHeight = 40;
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-bottom',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'bottom', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-bottom', 0, imgHeight);
      const pages = [{ number: 1, fragments: [fragment] }];

      const withoutFooter = {
        pageHeight: PAGE_HEIGHT,
        margins: { left: 72, right: 72, top: 72, bottom: MARGIN_BOTTOM, header: 36 },
      };

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', withoutFooter);

      const fallbackOrigin = PAGE_HEIGHT - MARGIN_BOTTOM;
      expect(fragment.y).toBe(PAGE_HEIGHT - imgHeight - fallbackOrigin);
    });
  });

  describe('passthrough cases — fragments that must NOT be modified', () => {
    it('does not modify non-anchored paragraph fragments', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-1',
        runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 5 }],
      };
      const fragment = makeParaFragment('para-1', 15);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBe(15);
    });

    it('does not modify paragraph-relative anchored images', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'paragraph', offsetV: 20 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 20, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBe(20);
    });

    it('does not modify margin-relative anchored images', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'margin', alignV: 'top', offsetV: 5 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 42, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBe(42);
    });

    it('returns early when pageHeight is null', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', offsetV: 10 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 42, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      const result = normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', {
        pageHeight: undefined,
        margins: { left: 0, right: 0 },
      });

      expect(fragment.y).toBe(42);
      expect(result).toBe(pages);
    });

    it('returns early when margins is undefined', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', offsetV: 10 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 42, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      const result = normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', { pageHeight: 1000 });

      expect(fragment.y).toBe(42);
      expect(result).toBe(pages);
    });
  });

  describe('mutation behavior', () => {
    it('mutates fragments in place and returns the same pages array', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 50 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 999, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      const result = normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(result).toBe(pages);
      expect(pages[0].fragments[0].y).toBe(50 - FOOTER_BAND_ORIGIN);
    });
  });
});
