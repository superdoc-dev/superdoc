import { describe, it, expect } from 'vitest';

import { collectEntityHitsFromChain } from './entity-at.js';

/**
 * Build a chain of nested HTMLElements with the dataset stamps the
 * painter would set. `layers[0]` becomes the innermost element;
 * subsequent layers wrap it. Returns the innermost element — the one
 * `document.elementFromPoint` would normally return for a click on
 * the innermost painted run.
 */
function buildPaintedChain(layers: Array<{ trackChangeId?: string; commentIds?: string }>): HTMLElement {
  const innerLayer = layers[0]!;
  const inner = document.createElement('span');
  if (innerLayer.trackChangeId) inner.dataset.trackChangeId = innerLayer.trackChangeId;
  if (innerLayer.commentIds) inner.dataset.commentIds = innerLayer.commentIds;

  let outer: HTMLElement = inner;
  for (let i = 1; i < layers.length; i += 1) {
    const layer = layers[i]!;
    const wrapper = document.createElement('span');
    if (layer.trackChangeId) wrapper.dataset.trackChangeId = layer.trackChangeId;
    if (layer.commentIds) wrapper.dataset.commentIds = layer.commentIds;
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
});
