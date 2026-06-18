import { describe, expect, it } from 'vitest';
import type { ResolvedPaintItem } from '@superdoc/contracts';
import { computeSdtBoundaryLayers } from './boundaries.js';

const makeItem = (
  y: number,
  sdtContainerKeys: (string | null)[],
  fragmentKind: 'para' | 'image' | 'drawing' = 'para',
): ResolvedPaintItem =>
  ({
    kind: 'fragment',
    id: `f-${y}`,
    pageIndex: 0,
    fragmentKind,
    blockId: `b-${y}`,
    fragmentIndex: y,
    height: 20,
    // Image/drawing resolved items are kind: 'fragment' with a fragment
    // back-pointer of the matching kind (see ResolvedImageItem/ResolvedDrawingItem),
    // so the boundary pass reads their geometry the same way as paragraphs.
    fragment: { kind: fragmentKind, blockId: `b-${y}`, x: 0, y, width: 100 },
    sdtContainerKey: sdtContainerKeys.length ? sdtContainerKeys[sdtContainerKeys.length - 1] : null,
    sdtContainerKeys,
  }) as unknown as ResolvedPaintItem;

const layerAtDepth = (layers: ReturnType<typeof computeSdtBoundaryLayers>, idx: number, depth: number) =>
  layers.get(idx)?.find((layer) => layer.depth === depth);

describe('computeSdtBoundaryLayers', () => {
  it('groups outer-inner-outer into one outer run and one inner run', () => {
    const items = [
      makeItem(0, ['structuredContent:outer']),
      makeItem(20, ['structuredContent:outer', 'structuredContent:inner']),
      makeItem(40, ['structuredContent:outer']),
    ];
    const layers = computeSdtBoundaryLayers(items, new Set());

    // depth 0: the outer control spans all three items as one run.
    expect(layerAtDepth(layers, 0, 0)).toMatchObject({ key: 'structuredContent:outer', isStart: true, isEnd: false });
    expect(layerAtDepth(layers, 1, 0)).toMatchObject({ key: 'structuredContent:outer', isStart: false, isEnd: false });
    expect(layerAtDepth(layers, 2, 0)).toMatchObject({ key: 'structuredContent:outer', isStart: false, isEnd: true });

    // depth 1: only the middle item belongs to the inner control.
    expect(layerAtDepth(layers, 1, 1)).toMatchObject({ key: 'structuredContent:inner', isStart: true, isEnd: true });
    expect(layerAtDepth(layers, 0, 1)).toBeUndefined();
    expect(layerAtDepth(layers, 2, 1)).toBeUndefined();
  });

  it('keeps real image and drawing items inside the run instead of splitting it', () => {
    // Image and drawing resolved items are kind: 'fragment' (fragmentKind
    // 'image'/'drawing') and, via FU2, carry the same container chain. They must
    // stay inside the outer run rather than break it into separate boxes.
    const items = [
      makeItem(0, ['structuredContent:outer'], 'para'),
      makeItem(20, ['structuredContent:outer'], 'image'),
      makeItem(40, ['structuredContent:outer'], 'drawing'),
      makeItem(60, ['structuredContent:outer'], 'para'),
    ];
    const layers = computeSdtBoundaryLayers(items, new Set());

    // One continuous outer run across para, image, drawing, para.
    expect(layerAtDepth(layers, 0, 0)).toMatchObject({ isStart: true, isEnd: false });
    expect(layerAtDepth(layers, 1, 0)).toMatchObject({ isStart: false, isEnd: false });
    expect(layerAtDepth(layers, 2, 0)).toMatchObject({ isStart: false, isEnd: false });
    expect(layerAtDepth(layers, 3, 0)).toMatchObject({ isStart: false, isEnd: true });
    // The image and drawing items are part of the run, not skipped.
    expect(layerAtDepth(layers, 1, 0)?.key).toBe('structuredContent:outer');
    expect(layerAtDepth(layers, 2, 0)?.key).toBe('structuredContent:outer');
  });

  it('dedupes labels by key and renders each container label once', () => {
    const labels = new Set<string>();
    const items = [
      makeItem(0, ['structuredContent:outer']),
      makeItem(20, ['structuredContent:outer', 'structuredContent:inner']),
    ];
    const layers = computeSdtBoundaryLayers(items, labels);

    expect(layerAtDepth(layers, 0, 0)?.showLabel).toBe(true);
    expect(layerAtDepth(layers, 1, 1)?.showLabel).toBe(true);
    expect(labels.has('structuredContent:outer')).toBe(true);
    expect(labels.has('structuredContent:inner')).toBe(true);

    // A second pass with the populated set must not re-show the outer label.
    const layers2 = computeSdtBoundaryLayers([makeItem(60, ['structuredContent:outer'])], labels);
    expect(layerAtDepth(layers2, 0, 0)?.showLabel).toBe(false);
  });

  it('falls back to the single sdtContainerKey when there is no chain', () => {
    const item = {
      kind: 'fragment',
      id: 'f',
      pageIndex: 0,
      fragmentKind: 'para',
      blockId: 'b',
      fragmentIndex: 0,
      height: 20,
      fragment: { kind: 'para', blockId: 'b', x: 0, y: 0, width: 100 },
      sdtContainerKey: 'documentSection:sec-1',
    } as unknown as ResolvedPaintItem;

    const layers = computeSdtBoundaryLayers([item], new Set());
    expect(layerAtDepth(layers, 0, 0)).toMatchObject({
      key: 'documentSection:sec-1',
      depth: 0,
      isStart: true,
      isEnd: true,
    });
  });

  it('produces no layers for items with no container key', () => {
    const layers = computeSdtBoundaryLayers([makeItem(0, [])], new Set());
    expect(layers.size).toBe(0);
  });
});
