/**
 * Editor-neutral hit-test and range-mapping substrate (prep-001).
 *
 * Verifies that:
 *  - `hitTestNeutral` returns a `LayoutHit` with a stable, opaque
 *    `fragmentId`, `blockRef`, and `LAYOUT_BOUNDARY_SCHEMA`, even when the
 *    target fragment does not carry `pmStart`/`pmEnd`.
 *  - `legacyPm` mirrors the existing PM-shaped `clickToPositionGeometry`
 *    result so v1 callers can keep working.
 *  - `mapRangeToFragmentsNeutral` returns neutral subranges that surface the
 *    same identity the painter would stamp in the DOM.
 *  - The neutral substrate works on fixtures that omit `pmStart`/`pmEnd`
 *    entirely.
 */
import { describe, it, expect } from 'vitest';
import {
  LAYOUT_BOUNDARY_SCHEMA,
  buildLayoutSourceIdentityForFragment,
  type FlowBlock,
  type Layout,
  type Measure,
} from '@superdoc/contracts';
import { hitTestNeutral, mapRangeToFragmentsNeutral, selectionToRects, type LayoutRect } from '../src/index.ts';

const block: FlowBlock = {
  kind: 'paragraph',
  id: '0-paragraph',
  runs: [
    { text: 'Hello ', fontFamily: 'Arial', fontSize: 16, pmStart: 1, pmEnd: 7 },
    { text: 'world', fontFamily: 'Arial', fontSize: 16, pmStart: 7, pmEnd: 12 },
  ],
};

const measure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 1,
      toChar: 5,
      width: 120,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    },
  ],
  totalHeight: 20,
};

const layout: Layout = {
  pageSize: { w: 400, h: 500 },
  layoutEpoch: 17,
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: '0-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 30,
          y: 40,
          width: 300,
          pmStart: 1,
          pmEnd: 12,
        },
      ],
    },
  ],
};

// Same layout, but with PM positions stripped from the paragraph fragment.
// Used to prove the neutral substrate does not require `pmStart`/`pmEnd`.
const layoutNoPm: Layout = {
  pageSize: { w: 400, h: 500 },
  layoutEpoch: 18,
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: '0-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 30,
          y: 40,
          width: 300,
        },
      ],
    },
  ],
};

const blockNoPm: FlowBlock = {
  kind: 'paragraph',
  id: '0-paragraph',
  runs: [
    { text: 'Hello ', fontFamily: 'Arial', fontSize: 16 },
    { text: 'world', fontFamily: 'Arial', fontSize: 16 },
  ],
};

const secondBlock: FlowBlock = {
  kind: 'paragraph',
  id: '1-paragraph',
  runs: [{ text: 'Second line', fontFamily: 'Arial', fontSize: 16, pmStart: 20, pmEnd: 31 }],
};

const secondMeasure: Measure = {
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 11,
      width: 110,
      ascent: 12,
      descent: 4,
      lineHeight: 20,
    },
  ],
  totalHeight: 20,
};

const stackedLayout: Layout = {
  pageSize: { w: 400, h: 500 },
  layoutEpoch: 19,
  pages: [
    {
      number: 1,
      fragments: [
        {
          kind: 'para',
          blockId: '0-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 30,
          y: 40,
          width: 300,
          pmStart: 1,
          pmEnd: 12,
        },
        {
          kind: 'para',
          blockId: '1-paragraph',
          fromLine: 0,
          toLine: 1,
          x: 30,
          y: 90,
          width: 300,
          pmStart: 20,
          pmEnd: 31,
        },
      ],
    },
  ],
};

describe('hitTestNeutral (prep-001)', () => {
  it('returns a LayoutHit with neutral identity and revision', () => {
    const hit = hitTestNeutral(layout, [block], [measure], { x: 40, y: 60 });
    expect(hit).not.toBeNull();
    expect(hit!.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(hit!.layoutRevision).toBe(17);
    expect(hit!.story).toEqual({ kind: 'body' });
    expect(hit!.blockRef).toBe('0-paragraph');
    expect(typeof hit!.fragmentId).toBe('string');
    expect(hit!.fragmentId.length).toBeGreaterThan(0);
    expect(hit!.identity.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(hit!.identity.blockRef).toBe('0-paragraph');
  });

  it('keeps the legacy PM-shaped hit available for v1 callers', () => {
    const hit = hitTestNeutral(layout, [block], [measure], { x: 40, y: 60 });
    expect(hit?.legacyPm).toBeDefined();
    expect(hit?.legacyPm?.blockId).toBe('0-paragraph');
    expect(hit?.legacyPm?.pageIndex).toBe(0);
    expect(typeof hit?.legacyPm?.pos).toBe('number');
  });

  it('returns identical fragment identity for two clicks on the same fragment', () => {
    const a = hitTestNeutral(layout, [block], [measure], { x: 40, y: 60 });
    const b = hitTestNeutral(layout, [block], [measure], { x: 80, y: 60 });
    expect(a?.fragmentId).toBe(b?.fragmentId);
    expect(a?.blockRef).toBe(b?.blockRef);
  });

  it('resolves a fragment without consulting pmStart/pmEnd on the fragment or runs', () => {
    const hit = hitTestNeutral(layoutNoPm, [blockNoPm], [measure], { x: 40, y: 60 });
    expect(hit).not.toBeNull();
    expect(hit!.blockRef).toBe('0-paragraph');
    expect(typeof hit!.fragmentId).toBe('string');
    expect(hit!.fragmentId.length).toBeGreaterThan(0);
    expect(hit!.legacyPm).toBeUndefined();
    expect(hit!.diagnostics).toContainEqual({ code: 'pm-position-unavailable' });
  });
});

describe('mapRangeToFragmentsNeutral (prep-001)', () => {
  it('returns no fragments for an empty PM range', () => {
    const mapping = mapRangeToFragmentsNeutral(layout, [block], [measure], { pmFrom: 3, pmTo: 3 }, selectionToRects);
    expect(mapping.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(mapping.fragments).toEqual([]);
  });

  it('returns neutral subranges with identity for a non-empty range', () => {
    const mapping = mapRangeToFragmentsNeutral(layout, [block], [measure], { pmFrom: 1, pmTo: 7 }, selectionToRects);
    expect(mapping.layoutRevision).toBe(17);
    expect(mapping.fragments.length).toBeGreaterThan(0);
    const first = mapping.fragments[0];
    expect(first.blockRef).toBe('0-paragraph');
    expect(first.story).toEqual({ kind: 'body' });
    expect(first.identity.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    const rect: LayoutRect = first.rect;
    expect(rect.pageIndex).toBe(0);
    expect(rect.width).toBeGreaterThan(0);
  });

  it('groups multiple rects under the matching fragment identity', () => {
    const mapping = mapRangeToFragmentsNeutral(layout, [block], [measure], { pmFrom: 1, pmTo: 12 }, selectionToRects);
    for (const slice of mapping.fragments) {
      expect(slice.blockRef).toBe('0-paragraph');
      expect(slice.identity.blockRef).toBe('0-paragraph');
    }
  });

  it('maps selection rects to the fragment that vertically overlaps the rect', () => {
    const mapping = mapRangeToFragmentsNeutral(
      stackedLayout,
      [block, secondBlock],
      [measure, secondMeasure],
      { pmFrom: 20, pmTo: 31 },
      selectionToRects,
    );
    expect(mapping.fragments.length).toBeGreaterThan(0);
    expect(mapping.fragments.every((slice) => slice.blockRef === '1-paragraph')).toBe(true);
  });

  it('maps known fragment ids without PM ranges or pmStart/pmEnd fields', () => {
    const fragment = layoutNoPm.pages[0].fragments[0];
    const identity = buildLayoutSourceIdentityForFragment(fragment);
    const mapping = mapRangeToFragmentsNeutral(layoutNoPm, [blockNoPm], [measure], {
      fragmentIds: [identity.fragmentId],
    });
    expect(mapping.layoutRevision).toBe(18);
    expect(mapping.fragments).toHaveLength(1);
    expect(mapping.fragments[0].fragmentId).toBe(identity.fragmentId);
    expect(mapping.fragments[0].rect.pageIndex).toBe(0);
    expect(mapping.fragments[0].rect.height).toBe(20);
  });
});
