/**
 * @vitest-environment jsdom
 *
 * Regression tests for the editor-side pointer-hit seam (prep-002).
 *
 * The PM-shaped path `resolvePointerPositionHit` is exercised extensively by
 * `DomPointerMapping.test.ts` and the PresentationEditor input tests. These
 * tests focus on the prep-002 contract:
 *
 *  - `resolvePointerLayoutHit` returns a `LayoutHit` whose `legacyPm` is
 *    identical to the v1 path's `PositionHit`.
 *  - `PositionHit` shape stays exact (`pos`, `layoutEpoch`, `blockId`,
 *    `pageIndex`, `column`, `lineIndex`).
 *  - Geometry-only mode (no DOM container) still returns the same v1 hit.
 */

import { describe, expect, it } from 'vitest';
import { LAYOUT_BOUNDARY_SCHEMA, type FlowBlock, type Layout, type Measure } from '@superdoc/contracts';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { clickToPositionGeometry } from '@superdoc/layout-bridge';

import { resolvePointerPositionHit, resolvePointerLayoutHit } from './PositionHitResolver.ts';

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
  layoutEpoch: 7,
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

const POSITION_HIT_KEYS = ['pos', 'layoutEpoch', 'blockId', 'pageIndex', 'column', 'lineIndex'].sort();

describe('PositionHitResolver — v1 surface (prep-002)', () => {
  it('returns the v1 PositionHit shape exactly in geometry-only mode', () => {
    const hit = resolvePointerPositionHit({
      layout,
      blocks: [block],
      measures: [measure],
      containerPoint: { x: 40, y: 60 },
    });
    expect(hit).not.toBeNull();
    expect(Object.keys(hit!).sort()).toEqual(POSITION_HIT_KEYS);
    expect(hit!.blockId).toBe('0-paragraph');
    expect(hit!.pageIndex).toBe(0);
    expect(typeof hit!.pos).toBe('number');
    expect(typeof hit!.layoutEpoch).toBe('number');
  });
});

describe('PositionHitResolver — neutral surface (prep-002)', () => {
  it('returns a LayoutHit with neutral identity', () => {
    const hit = resolvePointerLayoutHit({
      layout,
      blocks: [block],
      measures: [measure],
      containerPoint: { x: 40, y: 60 },
    });
    expect(hit).not.toBeNull();
    expect(hit!.schema).toBe(LAYOUT_BOUNDARY_SCHEMA);
    expect(hit!.blockRef).toBe('0-paragraph');
    expect(hit!.layoutRevision).toBe(7);
    expect(typeof hit!.fragmentId).toBe('string');
  });

  it('legacyPm matches the v1 path exactly for the same coordinate', () => {
    const v1Hit = resolvePointerPositionHit({
      layout,
      blocks: [block],
      measures: [measure],
      containerPoint: { x: 40, y: 60 },
    });
    const neutralHit = resolvePointerLayoutHit({
      layout,
      blocks: [block],
      measures: [measure],
      containerPoint: { x: 40, y: 60 },
    });
    expect(neutralHit?.legacyPm).toEqual(v1Hit);
  });

  it('preserves DOM-first legacyPm parity when DOM mapping differs from geometry', () => {
    const domContainer = document.createElement('div');
    const page = document.createElement('div');
    page.className = DOM_CLASS_NAMES.PAGE;
    page.dataset.pageIndex = '0';

    const fragment = document.createElement('div');
    fragment.className = DOM_CLASS_NAMES.FRAGMENT;

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
    domContainer.appendChild(page);
    document.body.appendChild(domContainer);

    try {
      const pointer = { x: 40, y: 60 };
      const v1Hit = resolvePointerPositionHit({
        layout,
        blocks: [block],
        measures: [measure],
        containerPoint: pointer,
        domContainer,
        clientX: 40,
        clientY: 60,
      });
      const geometryHit = clickToPositionGeometry(layout, [block], [measure], pointer);
      const neutralHit = resolvePointerLayoutHit({
        layout,
        blocks: [block],
        measures: [measure],
        containerPoint: pointer,
        domContainer,
        clientX: 40,
        clientY: 60,
      });

      expect(v1Hit?.pos).toBe(30);
      expect(geometryHit?.pos).not.toBe(v1Hit?.pos);
      expect(neutralHit?.legacyPm).toEqual(v1Hit);
    } finally {
      domContainer.remove();
    }
  });
});
