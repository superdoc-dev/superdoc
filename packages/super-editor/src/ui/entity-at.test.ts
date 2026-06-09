import { describe, it, expect, expectTypeOf } from 'vitest';

import { collectEntityHitsFromChain } from './entity-at.js';
import type {
  ContentControlViewportAddress,
  ViewportEntityAddress,
  ViewportEntityHit,
  ViewportGetRectInput,
} from './types.js';

/**
 * Build a chain of nested HTMLElements with the dataset stamps the
 * painter would set. `layers[0]` becomes the innermost element;
 * subsequent layers wrap it. Returns the innermost element — the one
 * `document.elementFromPoint` would normally return for a click on
 * the innermost painted run.
 */
type ChainLayer = {
  trackChangeId?: string;
  trackChangeIds?: string;
  trackChangePreferredTargetId?: string;
  commentIds?: string;
  sdtId?: string;
  sdtType?: string;
  sdtScope?: 'block' | 'inline';
  sdtTag?: string;
};

function applyLayer(el: HTMLElement, layer: ChainLayer): void {
  if (layer.trackChangeId) el.dataset.trackChangeId = layer.trackChangeId;
  if (layer.trackChangeIds) el.dataset.trackChangeIds = layer.trackChangeIds;
  if (layer.trackChangePreferredTargetId) {
    el.dataset.trackChangePreferredTargetId = layer.trackChangePreferredTargetId;
  }
  if (layer.commentIds) el.dataset.commentIds = layer.commentIds;
  if (layer.sdtId) el.dataset.sdtId = layer.sdtId;
  if (layer.sdtType) el.dataset.sdtType = layer.sdtType;
  if (layer.sdtScope) el.dataset.sdtScope = layer.sdtScope;
  if (layer.sdtTag) el.dataset.sdtTag = layer.sdtTag;
}

function buildPaintedChain(layers: Array<ChainLayer>): HTMLElement {
  const innerLayer = layers[0]!;
  const inner = document.createElement('span');
  applyLayer(inner, innerLayer);

  let outer: HTMLElement = inner;
  for (let i = 1; i < layers.length; i += 1) {
    const wrapper = document.createElement('span');
    applyLayer(wrapper, layers[i]!);
    wrapper.appendChild(outer);
    outer = wrapper;
  }
  document.body.appendChild(outer);
  return inner;
}

describe('collectEntityHitsFromChain', () => {
  it('returns hits for tracked-change and comment data attributes, innermost first', () => {
    const inner = buildPaintedChain([{ trackChangeId: 'tc-1' }, { commentIds: 'c-1' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'trackedChange', id: 'tc-1' },
      { type: 'comment', id: 'c-1' },
    ]);
  });

  it('orders the preferred tracked-change target before remaining multi-layer ids', () => {
    const inner = buildPaintedChain([
      { trackChangeIds: 'ins-parent,del-child', trackChangePreferredTargetId: 'del-child' },
    ]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'trackedChange', id: 'del-child' },
      { type: 'trackedChange', id: 'ins-parent' },
    ]);
  });

  it('falls back to legacy single tracked-change id data attributes', () => {
    const inner = buildPaintedChain([{ trackChangeId: 'legacy-tc' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([{ type: 'trackedChange', id: 'legacy-tc' }]);
  });

  it('falls back to the legacy id when the multi-layer tracked-change list is empty', () => {
    const inner = buildPaintedChain([{ trackChangeId: 'legacy-tc' }]);
    inner.dataset.trackChangeIds = ',,';

    expect(collectEntityHitsFromChain(inner)).toEqual([{ type: 'trackedChange', id: 'legacy-tc' }]);
  });

  it('skips empty tracked-change ids and deduplicates malformed comma lists across the chain', () => {
    const inner = buildPaintedChain([{ trackChangeIds: ',tc-1,,tc-2,tc-1,' }, { trackChangeIds: 'tc-2,tc-3' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'trackedChange', id: 'tc-1' },
      { type: 'trackedChange', id: 'tc-2' },
      { type: 'trackedChange', id: 'tc-3' },
    ]);
  });

  it('expands comma-separated comment ids into one hit per id', () => {
    const inner = buildPaintedChain([{ commentIds: 'c-1,c-2,c-3' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'comment', id: 'c-1' },
      { type: 'comment', id: 'c-2' },
      { type: 'comment', id: 'c-3' },
    ]);
  });

  it('deduplicates the same id when it appears multiple times in the chain', () => {
    const inner = buildPaintedChain([{ commentIds: 'c-1' }, { commentIds: 'c-1' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([{ type: 'comment', id: 'c-1' }]);
  });

  it('combines trackedChange + comment + outer comment in document order (innermost → outermost)', () => {
    const inner = buildPaintedChain([{ trackChangeId: 'tc-1' }, { commentIds: 'c-inner' }, { commentIds: 'c-outer' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'trackedChange', id: 'tc-1' },
      { type: 'comment', id: 'c-inner' },
      { type: 'comment', id: 'c-outer' },
    ]);
  });

  it('keeps inner multi-layer tracked changes before outer comments and content controls', () => {
    const inner = buildPaintedChain([
      { trackChangeIds: 'ins-parent,del-child', trackChangePreferredTargetId: 'del-child' },
      { commentIds: 'c-outer' },
      { sdtId: 'sdt-outer', sdtType: 'structuredContent', sdtScope: 'inline' },
    ]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'trackedChange', id: 'del-child' },
      { type: 'trackedChange', id: 'ins-parent' },
      { type: 'comment', id: 'c-outer' },
      { type: 'contentControl', id: 'sdt-outer', scope: 'inline' },
    ]);
  });

  it('returns [] when the chain has no painted entities', () => {
    const inner = buildPaintedChain([{}]);

    expect(collectEntityHitsFromChain(inner)).toEqual([]);
  });

  it('returns [] for null or non-Element starts', () => {
    expect(collectEntityHitsFromChain(null)).toEqual([]);
    expect(collectEntityHitsFromChain({} as never)).toEqual([]);
  });

  it('skips empty ids in a malformed comma list', () => {
    const inner = buildPaintedChain([{ commentIds: ',c-1,,c-2,' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'comment', id: 'c-1' },
      { type: 'comment', id: 'c-2' },
    ]);
  });

  // -------------------------------------------------------------------------
  // contentControl (SDT)
  // -------------------------------------------------------------------------

  it('surfaces a contentControl hit for inline structured-content wrappers', () => {
    const inner = buildPaintedChain([
      { sdtId: 'sdt-1', sdtType: 'structuredContent', sdtScope: 'inline', sdtTag: 'citation' },
    ]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'contentControl', id: 'sdt-1', scope: 'inline', tag: 'citation' },
    ]);
  });

  it('surfaces a contentControl hit for block structured-content wrappers', () => {
    const inner = buildPaintedChain([{ sdtId: 'sdt-2', sdtType: 'structuredContent', sdtScope: 'block' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([{ type: 'contentControl', id: 'sdt-2', scope: 'block' }]);
  });

  it('does not surface non-structuredContent SDT types (fieldAnnotation, documentSection, docPartObject)', () => {
    const fieldAnnotation = buildPaintedChain([{ sdtId: 'fa-1', sdtType: 'fieldAnnotation' }]);
    expect(collectEntityHitsFromChain(fieldAnnotation)).toEqual([]);

    const section = buildPaintedChain([{ sdtId: 'sec-1', sdtType: 'documentSection' }]);
    expect(collectEntityHitsFromChain(section)).toEqual([]);

    const docPart = buildPaintedChain([{ sdtId: 'dp-1', sdtType: 'docPartObject' }]);
    expect(collectEntityHitsFromChain(docPart)).toEqual([]);
  });

  it('emits innermost-first when content controls are nested', () => {
    const inner = buildPaintedChain([
      { sdtId: 'inner-sdt', sdtType: 'structuredContent', sdtScope: 'inline' },
      { sdtId: 'outer-sdt', sdtType: 'structuredContent', sdtScope: 'block' },
    ]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'contentControl', id: 'inner-sdt', scope: 'inline' },
      { type: 'contentControl', id: 'outer-sdt', scope: 'block' },
    ]);
  });

  it('combines tracked-change, comment, and contentControl hits in document order', () => {
    const inner = buildPaintedChain([
      { trackChangeId: 'tc-1' },
      { commentIds: 'c-1' },
      { sdtId: 'sdt-9', sdtType: 'structuredContent', sdtScope: 'inline', sdtTag: 'clause' },
    ]);

    expect(collectEntityHitsFromChain(inner)).toEqual([
      { type: 'trackedChange', id: 'tc-1' },
      { type: 'comment', id: 'c-1' },
      { type: 'contentControl', id: 'sdt-9', scope: 'inline', tag: 'clause' },
    ]);
  });

  it('omits scope and tag from the hit when those attrs are absent', () => {
    const inner = buildPaintedChain([{ sdtId: 'sdt-3', sdtType: 'structuredContent' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([{ type: 'contentControl', id: 'sdt-3' }]);
  });

  it('ignores wrappers that carry data-sdt-id but no data-sdt-type', () => {
    // Defensive: if some future code stamps `data-sdt-id` without the type
    // (e.g. a debug attr leak), the entity walk must not over-match.
    const inner = buildPaintedChain([{ sdtId: 'mystery-sdt' }]);

    expect(collectEntityHitsFromChain(inner)).toEqual([]);
  });

  it('deduplicates the same contentControl id when it appears multiple times', () => {
    const inner = buildPaintedChain([
      { sdtId: 'sdt-x', sdtType: 'structuredContent', sdtScope: 'inline' },
      { sdtId: 'sdt-x', sdtType: 'structuredContent', sdtScope: 'inline' },
    ]);

    expect(collectEntityHitsFromChain(inner)).toEqual([{ type: 'contentControl', id: 'sdt-x', scope: 'inline' }]);
  });

  // -------------------------------------------------------------------------
  // Public type-shape contracts (compile-time)
  // -------------------------------------------------------------------------

  it('typing: ViewportEntityHit accepts contentControl variant', () => {
    // Regression for the case where the type was only
    // `comment | trackedChange` — a consumer writing the contentControl
    // shape would have failed to compile.
    const hit: ViewportEntityHit = { type: 'contentControl', id: 'sdt-1', scope: 'inline', tag: 'citation' };
    expectTypeOf(hit).toEqualTypeOf<ViewportEntityHit>();
    expect(hit.type).toBe('contentControl');
  });

  it('typing: ViewportGetRectInput.target accepts a content-control entity address', () => {
    // Regression: the field was @superdoc/document-api `EntityAddress`,
    // which only allows `comment | trackedChange`. A typed consumer
    // calling getRect for a content control would have errored.
    const target: ContentControlViewportAddress = {
      kind: 'entity',
      entityType: 'contentControl',
      entityId: 'sdt-1',
    };
    const input: ViewportGetRectInput = { target };
    expectTypeOf(input.target).toMatchTypeOf<ViewportEntityAddress>();
    expect(input.target.entityType).toBe('contentControl');
  });
});
