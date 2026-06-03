/**
 * @vitest-environment jsdom
 *
 * Regression tests for the editor-side prep-002 compatibility adapter.
 *
 * Covers:
 *   - `layoutHitToPositionHit` projects neutral hits onto the v1 PositionHit
 *     shape and preserves every required field.
 *   - `resolvePointerLayoutHit` returns a `LayoutHit` whose `legacyPm` is
 *     identical to what the existing v1 path would have produced.
 *   - `mapPmRangeToLayoutFragments` returns fragment subranges for the
 *     existing PM-shaped selection.
 *   - DOM identity helpers read `data-layout-*` and fall back to `data-pm-*`
 *     correctly.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAYOUT_BOUNDARY_SCHEMA, type FlowBlock, type Layout, type Measure } from '@superdoc/contracts';
import { DATA_ATTRS, DATASET_KEYS, DOM_CLASS_NAMES, encodeLayoutStoryDataset } from '@superdoc/dom-contract';
import { clickToPositionGeometry, hitTestNeutral, type PositionHit } from '@superdoc/layout-bridge';

import {
  findElementByLayoutFragmentId,
  findNearestRenderedElementIdentity,
  layoutHitToPositionHit,
  mapPmRangeToLayoutFragments,
  readRenderedElementIdentity,
  resolvePointerLayoutHit,
} from './LayoutHitV1Compat.ts';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

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
  layoutEpoch: 42,
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

// ---------------------------------------------------------------------------
// PositionHit projection
// ---------------------------------------------------------------------------

describe('layoutHitToPositionHit (prep-002)', () => {
  const POSITION_HIT_KEYS = ['pos', 'layoutEpoch', 'blockId', 'pageIndex', 'column', 'lineIndex'].sort();

  it('returns null for null input', () => {
    expect(layoutHitToPositionHit(null)).toBeNull();
    expect(layoutHitToPositionHit(undefined)).toBeNull();
  });

  it('extracts legacyPm and preserves the v1 PositionHit shape exactly', () => {
    const hit = hitTestNeutral(layout, [block], [measure], { x: 40, y: 60 });
    expect(hit).not.toBeNull();
    const positionHit = layoutHitToPositionHit(hit);
    expect(positionHit).not.toBeNull();

    const keys = Object.keys(positionHit as PositionHit).sort();
    expect(keys).toEqual(POSITION_HIT_KEYS);

    expect(typeof positionHit!.pos).toBe('number');
    expect(typeof positionHit!.layoutEpoch).toBe('number');
    expect(typeof positionHit!.blockId).toBe('string');
    expect(typeof positionHit!.pageIndex).toBe('number');
    expect(typeof positionHit!.column).toBe('number');
    expect(typeof positionHit!.lineIndex).toBe('number');
  });

  it('matches the PM-shaped geometry path 1:1 for the same coordinate', () => {
    const containerPoint = { x: 40, y: 60 };
    const v1Hit = clickToPositionGeometry(layout, [block], [measure], containerPoint);
    const neutralHit = hitTestNeutral(layout, [block], [measure], containerPoint);
    const projected = layoutHitToPositionHit(neutralHit);
    expect(projected).toEqual(v1Hit);
  });
});

// ---------------------------------------------------------------------------
// resolvePointerLayoutHit
// ---------------------------------------------------------------------------

describe('resolvePointerLayoutHit (prep-002)', () => {
  it('returns a LayoutHit with the neutral schema and identity', () => {
    const hit = resolvePointerLayoutHit({
      layout,
      blocks: [block],
      measures: [measure],
      containerPoint: { x: 40, y: 60 },
    });
    expect(hit).not.toBeNull();
    expect(hit!.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(hit!.blockRef).toBe('0-paragraph');
    expect(typeof hit!.fragmentId).toBe('string');
    expect(hit!.legacyPm).toBeDefined();
  });

  it('legacyPm mirrors the existing v1 pointer path', () => {
    const v1Hit = clickToPositionGeometry(layout, [block], [measure], { x: 40, y: 60 });
    const layoutHit = resolvePointerLayoutHit({
      layout,
      blocks: [block],
      measures: [measure],
      containerPoint: { x: 40, y: 60 },
    });
    expect(layoutHit?.legacyPm).toEqual(v1Hit);
  });

  it('uses DOM-first PM mapping for legacyPm when DOM and geometry disagree', () => {
    const container = document.createElement('div');
    const page = document.createElement('div');
    page.className = DOM_CLASS_NAMES.PAGE;
    page.dataset.pageIndex = '0';

    const fragment = document.createElement('div');
    fragment.className = DOM_CLASS_NAMES.FRAGMENT;
    fragment.setAttribute(DATA_ATTRS.LAYOUT_FRAGMENT_ID, 'header:rIdHeader1|header-p|para:0:1');
    fragment.setAttribute(DATA_ATTRS.LAYOUT_BLOCK_REF, 'header-p');
    fragment.setAttribute(DATA_ATTRS.LAYOUT_STORY, encodeLayoutStoryDataset({ kind: 'header', id: 'rIdHeader1' }));
    fragment.dataset.sourceAnchor = JSON.stringify({ sourceNodeId: 'src-header-p', anchorConfidence: 'high' });

    const line = document.createElement('div');
    line.className = DOM_CLASS_NAMES.LINE;
    line.dataset.pmStart = '20';
    line.dataset.pmEnd = '30';

    const span = document.createElement('span');
    span.dataset.pmStart = '20';
    span.dataset.pmEnd = '30';
    span.textContent = 'DOM text';

    line.appendChild(span);
    fragment.appendChild(line);
    page.appendChild(fragment);
    container.appendChild(page);
    document.body.appendChild(container);
    const previousElementsFromPoint = document.elementsFromPoint;
    document.elementsFromPoint = () => [span, line, fragment, page, container];

    try {
      const pointer = { x: 40, y: 60 };
      const geometryHit = clickToPositionGeometry(layout, [block], [measure], pointer);
      const layoutHit = resolvePointerLayoutHit({
        layout,
        blocks: [block],
        measures: [measure],
        containerPoint: pointer,
        domContainer: container,
        clientX: 40,
        clientY: 60,
      });

      expect(layoutHit?.legacyPm?.pos).toBe(30);
      expect(layoutHit?.legacyPm?.pos).not.toBe(geometryHit?.pos);
      expect(layoutHit?.story).toEqual({ kind: 'header', id: 'rIdHeader1' });
      expect(layoutHit?.fragmentId).toBe('header:rIdHeader1|header-p|para:0:1');
      expect(layoutHit?.sourceAnchor).toEqual({ sourceNodeId: 'src-header-p', anchorConfidence: 'high' });
    } finally {
      document.elementsFromPoint = previousElementsFromPoint;
      container.remove();
    }
  });
});

// ---------------------------------------------------------------------------
// mapPmRangeToLayoutFragments
// ---------------------------------------------------------------------------

describe('mapPmRangeToLayoutFragments (prep-002)', () => {
  it('returns the v1 PM range as neutral fragment subranges', () => {
    const mapping = mapPmRangeToLayoutFragments(layout, [block], [measure], {
      pmFrom: 1,
      pmTo: 7,
    });
    expect(mapping.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(mapping.layoutRevision).toBe(42);
    expect(mapping.fragments.length).toBeGreaterThan(0);
    for (const frag of mapping.fragments) {
      expect(frag.blockRef).toBe('0-paragraph');
      expect(frag.pageIndex).toBe(0);
      expect(typeof frag.fragmentId).toBe('string');
    }
  });

  it('returns no fragments for a collapsed PM range', () => {
    const mapping = mapPmRangeToLayoutFragments(layout, [block], [measure], {
      pmFrom: 3,
      pmTo: 3,
    });
    expect(mapping.fragments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DOM identity helpers
// ---------------------------------------------------------------------------

describe('readRenderedElementIdentity / findNearestRenderedElementIdentity (prep-002)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('reads neutral identity datasets alongside the legacy PM range', () => {
    const span = document.createElement('span');
    span.setAttribute(DATA_ATTRS.LAYOUT_FRAGMENT_ID, 'body|0-paragraph|para:0:1');
    span.setAttribute(DATA_ATTRS.LAYOUT_BLOCK_REF, '0-paragraph');
    span.setAttribute(DATA_ATTRS.LAYOUT_STORY, encodeLayoutStoryDataset({ kind: 'body' }));
    span.dataset.sourceAnchor = JSON.stringify({ sourceNodeId: 'src-body-p', anchorConfidence: 'high' });
    span.setAttribute(DATA_ATTRS.PM_START, '1');
    span.setAttribute(DATA_ATTRS.PM_END, '12');
    container.appendChild(span);

    const identity = readRenderedElementIdentity(span);
    expect(identity.fragmentId).toBe('body|0-paragraph|para:0:1');
    expect(identity.blockRef).toBe('0-paragraph');
    expect(identity.story).toEqual({ kind: 'body' });
    expect(identity.sourceAnchor).toEqual({ sourceNodeId: 'src-body-p', anchorConfidence: 'high' });
    expect(identity.pm).toEqual({ start: 1, end: 12 });
  });

  it('still returns PM range when neutral datasets are absent (compat-fallback path)', () => {
    const span = document.createElement('span');
    span.setAttribute(DATA_ATTRS.PM_START, '4');
    span.setAttribute(DATA_ATTRS.PM_END, '8');
    container.appendChild(span);

    const identity = readRenderedElementIdentity(span);
    expect(identity.fragmentId).toBeUndefined();
    expect(identity.blockRef).toBeUndefined();
    expect(identity.story).toBeUndefined();
    expect(identity.pm).toEqual({ start: 4, end: 8 });
  });

  it('returns empty result for null element', () => {
    expect(readRenderedElementIdentity(null)).toEqual({});
    expect(readRenderedElementIdentity(undefined)).toEqual({});
  });

  it('finds the nearest neutral identity by walking ancestors', () => {
    const fragmentEl = document.createElement('div');
    fragmentEl.setAttribute(DATA_ATTRS.LAYOUT_FRAGMENT_ID, 'body|0-paragraph|para:0:1');
    fragmentEl.setAttribute(DATA_ATTRS.LAYOUT_BLOCK_REF, '0-paragraph');
    fragmentEl.setAttribute(DATA_ATTRS.LAYOUT_STORY, 'body');
    fragmentEl.dataset.sourceAnchor = JSON.stringify({ sourceNodeId: 'src-ancestor', anchorConfidence: 'medium' });

    const inner = document.createElement('span');
    inner.setAttribute(DATA_ATTRS.PM_START, '2');
    inner.setAttribute(DATA_ATTRS.PM_END, '5');
    fragmentEl.appendChild(inner);
    container.appendChild(fragmentEl);

    const nearest = findNearestRenderedElementIdentity(inner, container);
    expect(nearest).toBeDefined();
    expect(nearest!.fragmentId).toBe('body|0-paragraph|para:0:1');
    expect(nearest!.blockRef).toBe('0-paragraph');
    expect(nearest!.story).toEqual({ kind: 'body' });
    expect(nearest!.sourceAnchor).toEqual({ sourceNodeId: 'src-ancestor', anchorConfidence: 'medium' });
  });

  it('returns undefined when no ancestor carries neutral identity', () => {
    const span = document.createElement('span');
    container.appendChild(span);
    expect(findNearestRenderedElementIdentity(span, container)).toBeUndefined();
  });
});

describe('findElementByLayoutFragmentId (prep-002)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('finds the element whose data-layout-fragment-id matches', () => {
    const el = document.createElement('div');
    el.setAttribute(DATA_ATTRS.LAYOUT_FRAGMENT_ID, 'body|0-paragraph|para:0:1');
    container.appendChild(el);

    const found = findElementByLayoutFragmentId(container, 'body|0-paragraph|para:0:1');
    expect(found).toBe(el);
  });

  it('escapes special characters in the fragment id', () => {
    const id = 'body|table:fancy,id|para:0:1';
    const el = document.createElement('div');
    el.setAttribute(DATA_ATTRS.LAYOUT_FRAGMENT_ID, id);
    container.appendChild(el);

    const found = findElementByLayoutFragmentId(container, id);
    expect(found).toBe(el);
  });

  it('returns null for unknown / empty inputs', () => {
    expect(findElementByLayoutFragmentId(container, null)).toBeNull();
    expect(findElementByLayoutFragmentId(container, '')).toBeNull();
    expect(findElementByLayoutFragmentId(null, 'x')).toBeNull();
    expect(findElementByLayoutFragmentId(container, 'no-such-fragment')).toBeNull();
  });
});
