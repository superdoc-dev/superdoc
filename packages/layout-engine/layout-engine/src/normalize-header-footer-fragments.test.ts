import { describe, expect, it } from 'vite-plus/test';
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
const MARGIN_BOTTOM = 72;
const FOOTER_DISTANCE = 36;

const fullConstraints = {
  width: 672,
  pageWidth: 816,
  pageHeight: PAGE_HEIGHT,
  margins: { left: 72, right: 72, top: 72, bottom: MARGIN_BOTTOM, header: 36, footer: FOOTER_DISTANCE },
};

const FOOTER_BAND_ORIGIN = PAGE_HEIGHT - FOOTER_DISTANCE; // 1020

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeFragmentsForRegion', () => {
  describe('margin-relative anchors in header', () => {
    it('normalizes visible margin-relative header content to header-local y', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'header-logo',
        src: 'logo.png',
        anchor: { isAnchored: true, vRelativeFrom: 'margin', alignV: 'bottom', offsetV: 0 },
        wrap: { type: 'Square' },
      };
      const fragment = makeAnchoredImageFragment('header-logo', 826.2, 68);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.y).toBe(0);
    });

    it('does not normalize behind-doc header overlays', () => {
      const block: FlowBlock = {
        kind: 'image',
        id: 'header-watermark',
        src: 'watermark.png',
        anchor: { isAnchored: true, vRelativeFrom: 'margin', alignV: 'center', offsetV: 0, behindDoc: true },
        wrap: { type: 'None' },
      };
      const fragment = makeAnchoredImageFragment('header-watermark', 400, 120);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.y).toBe(400);
    });
  });

  describe('page-relative anchors in header', () => {
    it('normalizes page-relative header content to page-top-local y', () => {
      const block: FlowBlock = {
        kind: 'drawing',
        id: 'header-textbox',
        drawingKind: 'vectorShape',
        geometry: { width: 816, height: 27 },
        anchor: { isAnchored: true, vRelativeFrom: 'page', alignV: 'top', offsetV: 20 },
        wrap: { type: 'None' },
      };
      const fragment = {
        kind: 'drawing',
        blockId: 'header-textbox',
        x: 0,
        y: -988,
        height: 27,
        isAnchored: true,
      } as unknown as Fragment;
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.y).toBe(20);
    });
  });

  describe('page-relative anchors in footer', () => {
    it.each([
      ['right', 602, 746],
      ['center', 301, 373],
    ] as const)(
      'resolves page-anchored paragraph frame %s alignment against the physical page',
      (xAlign, x, expectedX) => {
        const block: FlowBlock = {
          kind: 'paragraph',
          id: 'footer-frame',
          runs: [],
          attrs: { frame: { wrap: 'around', hAnchor: 'page', vAnchor: 'page', xAlign, y: 988.8667 } },
        };
        const fragment = makeParaFragment('footer-frame', 988.8667);
        fragment.x = x;
        const pages = [{ number: 1, fragments: [fragment] }];

        normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

        expect(fragment.x).toBe(expectedX);
      },
    );

    it('normalizes a page-anchored paragraph frame from physical to footer-local coordinates', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'footer-frame',
        runs: [],
        attrs: { frame: { wrap: 'around', vAnchor: 'page', y: 988.8667 } },
      };
      const fragment = makeParaFragment('footer-frame', 988.8667);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBeCloseTo(988.8667 - (PAGE_HEIGHT - MARGIN_BOTTOM));
    });

    it.each([undefined, 'auto'])('keeps wrap=%s page-anchored paragraphs in ordinary flow', (wrap) => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'ordinary-footer-paragraph',
        runs: [],
        attrs: { frame: { wrap, vAnchor: 'page', y: 988.8667 } },
      };
      const fragments = [makeParaFragment(block.id, 12), makeParaFragment(block.id, 26)];
      const pages = [{ number: 1, fragments }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragments.map((fragment) => fragment.y)).toEqual([12, 26]);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY])('does not normalize a page-anchored frame with y=%s', (y) => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'non-finite-footer-frame',
        runs: [],
        attrs: { frame: { wrap: 'around', vAnchor: 'page', y } },
      };
      const fragment = makeParaFragment(block.id, 12);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBe(12);
    });

    it.each([
      ['negative', -24],
      ['non-finite', Number.NaN],
      ['missing', undefined],
    ])('uses the page bottom as the paragraph-frame origin for a %s bottom margin', (_label, bottom) => {
      const physicalY = 988.8667;
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'footer-frame-invalid-margin',
        runs: [],
        attrs: { frame: { wrap: 'around', vAnchor: 'page', y: physicalY } },
      };
      const fragment = makeParaFragment(block.id, physicalY);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', {
        pageHeight: PAGE_HEIGHT,
        margins: { left: 72, right: 72, bottom },
      });

      expect(fragment.y + PAGE_HEIGHT).toBeCloseTo(physicalY);
    });

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
    it('keeps page-anchored paragraph frames page-top-local in headers', () => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'header-frame',
        runs: [],
        attrs: { frame: { wrap: 'around', vAnchor: 'page', y: 24 } },
      };
      const fragment = makeParaFragment('header-frame', 99);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'header', fullConstraints);

      expect(fragment.y).toBe(24);
    });

    it.each(['text', 'margin'])('does not modify %s-anchored paragraph frames', (vAnchor) => {
      const block: FlowBlock = {
        kind: 'paragraph',
        id: 'local-frame',
        runs: [],
        attrs: { frame: { wrap: 'around', vAnchor, y: 24 } },
      };
      const fragment = makeParaFragment('local-frame', 37);
      const pages = [{ number: 1, fragments: [fragment] }];

      normalizeFragmentsForRegion(pages, [block], [makeDummyMeasure()], 'footer', fullConstraints);

      expect(fragment.y).toBe(37);
    });

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
