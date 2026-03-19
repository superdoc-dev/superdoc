import { describe, expect, it } from 'vitest';
import type { FlowBlock, Fragment, Measure } from '@superdoc/contracts';
import { normalizeFragmentsForRegion } from './normalize-header-footer-fragments.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParaFragment(blockId: string, y: number): Fragment {
  return { kind: 'para', blockId, x: 0, y, fromLine: 0, toLine: 1 } as Fragment;
}

function makeAnchoredImageFragment(blockId: string, y: number, height: number): Fragment {
  return { kind: 'image', blockId, x: 0, y, height, isAnchored: true } as unknown as Fragment;
}

function makeDummyMeasure(): Measure {
  return { kind: 'paragraph', lines: [], totalHeight: 0 } as Measure;
}

const PAGE_HEIGHT = 1056;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const HEADER_MARGIN = 36; // distance from top edge to header band

const fullConstraints = {
  pageHeight: PAGE_HEIGHT,
  margins: { left: 72, right: 72, top: MARGIN_TOP, bottom: MARGIN_BOTTOM, header: HEADER_MARGIN },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeFragmentsForRegion', () => {
  describe('header normalization', () => {
    it('normalizes a page-relative top-aligned anchor in a header', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 10 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 999 /* synthetic y */, 50);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      // physicalY = offsetV = 10, bandOrigin = header margin = 36
      // localY = 10 - 36 = -26
      expect(fragment.y).toBe(10 - HEADER_MARGIN);
    });

    it('normalizes a page-relative bottom-aligned anchor in a header', () => {
      const imgHeight = 50;
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'bottom', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, imgHeight);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      // physicalY = pageHeight - imgHeight + offsetV = 1056 - 50 = 1006
      // localY = 1006 - 36 = 970
      expect(fragment.y).toBe(PAGE_HEIGHT - imgHeight - HEADER_MARGIN);
    });

    it('normalizes a page-relative center-aligned anchor in a header', () => {
      const imgHeight = 40;
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'center', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, imgHeight);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      // physicalY = (1056 - 40) / 2 = 508
      // localY = 508 - 36 = 472
      expect(fragment.y).toBe((PAGE_HEIGHT - imgHeight) / 2 - HEADER_MARGIN);
    });

    it('normalizes a margin-relative top-aligned anchor in a header', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'margin', alignV: 'top', offsetV: 5 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      // physicalY = marginTop + offsetV = 72 + 5 = 77
      // localY = 77 - 36 = 41
      expect(fragment.y).toBe(MARGIN_TOP + 5 - HEADER_MARGIN);
    });

    it('normalizes a margin-relative bottom-aligned anchor in a header', () => {
      const imgHeight = 30;
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'margin', alignV: 'bottom', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, imgHeight);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      // contentBottom = pageHeight - marginBottom = 1056 - 72 = 984
      // physicalY = contentBottom - imgHeight = 984 - 30 = 954
      // localY = 954 - 36 = 918
      expect(fragment.y).toBe(PAGE_HEIGHT - MARGIN_BOTTOM - imgHeight - HEADER_MARGIN);
    });
  });

  describe('footer normalization', () => {
    it('normalizes a page-relative top-aligned anchor in a footer', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 0 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 0, 50);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      // physicalY = 0, footerBandOrigin = pageHeight - marginBottom = 1056 - 72 = 984
      // localY = 0 - 984 = -984
      expect(fragment.y).toBe(0 - (PAGE_HEIGHT - MARGIN_BOTTOM));
    });

    it('normalizes a page-relative bottom-aligned anchor in a footer', () => {
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

      // physicalY = 1056 - 50 = 1006
      // footerBandOrigin = 1056 - 72 = 984
      // localY = 1006 - 984 = 22
      expect(fragment.y).toBe(PAGE_HEIGHT - imgHeight - (PAGE_HEIGHT - MARGIN_BOTTOM));
    });
  });

  describe('passthrough / no-op cases', () => {
    it('does not modify non-anchored fragments', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'para-1',
        runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: 5 }],
      };
      const fragment = makeParaFragment('para-1', 15);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.y).toBe(15);
    });

    it('does not modify anchored images without page/margin-relative vRelativeFrom', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'img-1',
        src: 'test.png',
        anchor: { isAnchored: true, vRelativeFrom: 'paragraph', offsetV: 20 },
      };
      const fragment = makeAnchoredImageFragment('img-1', 20, 30);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.y).toBe(20);
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

      const result = normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', {
        pageHeight: undefined,
        margins: { left: 0, right: 0 },
      });

      expect(fragment.y).toBe(42); // unchanged
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

      const result = normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', { pageHeight: 1000 });

      expect(fragment.y).toBe(42); // unchanged
      expect(result).toBe(pages);
    });
  });

  describe('drawing blocks', () => {
    it('normalizes page-relative drawing blocks the same as image blocks', () => {
      const block: FlowBlock = {
        kind: 'drawing',
        id: 'draw-1',
        drawingKind: 'vectorShape',
        geometry: { width: 100, height: 50 },
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 0 },
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

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      // physicalY = 0, bandOrigin = 36
      expect(fragment.y).toBe(-HEADER_MARGIN);
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

      const result = normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(result).toBe(pages);
      // Verify mutation happened on the original object
      expect(pages[0].fragments[0].y).toBe(50 - HEADER_MARGIN);
    });
  });
});
