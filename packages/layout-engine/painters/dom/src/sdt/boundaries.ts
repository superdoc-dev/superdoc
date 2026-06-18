import type { Fragment, ResolvedPaintItem } from '@superdoc/contracts';
import type { SdtBoundaryOptions } from './container.js';

export const computeSdtBoundaries = (
  resolvedItems: readonly ResolvedPaintItem[],
  sdtLabelsRendered: Set<string>,
): Map<number, SdtBoundaryOptions> => {
  const boundaries = new Map<number, SdtBoundaryOptions>();
  const containerKeys: (string | null)[] = resolvedItems.map((item) => {
    if (item && 'sdtContainerKey' in item) {
      const key = (item as { sdtContainerKey?: string | null }).sdtContainerKey;
      return key ?? null;
    }
    return null;
  });

  const fragmentOf = (idx: number): Fragment | null => {
    const item = resolvedItems[idx];
    return item && item.kind === 'fragment' ? item.fragment : null;
  };

  let i = 0;
  while (i < resolvedItems.length) {
    const currentKey = containerKeys[i];
    const startFrag = fragmentOf(i);
    if (!currentKey || !startFrag) {
      i += 1;
      continue;
    }

    let groupRight = startFrag.x + startFrag.width;
    let j = i;

    while (j + 1 < resolvedItems.length && containerKeys[j + 1] === currentKey) {
      j += 1;
      const nextFrag = fragmentOf(j);
      if (!nextFrag) break;
      const fragmentRight = nextFrag.x + nextFrag.width;
      if (fragmentRight > groupRight) {
        groupRight = fragmentRight;
      }
    }

    for (let k = i; k <= j; k += 1) {
      const fragment = fragmentOf(k);
      if (!fragment) continue;
      const isStart = k === i;
      const isEnd = k === j;

      let paddingBottomOverride: number | undefined;
      if (!isEnd) {
        const nextFragment = fragmentOf(k + 1);
        const currentHeight = (resolvedItems[k] as { height?: number } | undefined)?.height ?? 0;
        const currentBottom = fragment.y + currentHeight;
        if (nextFragment) {
          const gapToNext = nextFragment.y - currentBottom;
          if (gapToNext > 0) {
            paddingBottomOverride = gapToNext;
          }
        }
      }

      const showLabel = isStart && !sdtLabelsRendered.has(currentKey);
      if (showLabel) {
        sdtLabelsRendered.add(currentKey);
      }

      boundaries.set(k, {
        isStart,
        isEnd,
        widthOverride: groupRight - fragment.x,
        paddingBottomOverride,
        showLabel,
      });
    }

    i = j + 1;
  }

  return boundaries;
};

export type SdtBoundaryLayer = SdtBoundaryOptions & {
  /** Container key for this layer (`structuredContent:<id>` or `documentSection:<id>`). */
  key: string;
  /** Nesting depth; 0 = outermost container. */
  depth: number;
};

/**
 * Depth-aware variant of computeSdtBoundaries for nested block content controls.
 * Reads each item's `sdtContainerKeys` chain (outermost first) and, at every
 * depth independently, groups contiguous items sharing the same container key at
 * that depth. An item inside N nested controls gets N boundary layers
 * (depth 0 = outermost). Falls back to the single `sdtContainerKey` when an item
 * carries no chain, so non-nested content behaves exactly as before.
 *
 * Example: chains [outer], [outer, inner], [outer] produce one continuous outer
 * run at depth 0 and a single inner run (the middle item) at depth 1.
 * Image/drawing items that carry the same chain stay inside the run rather than
 * splitting it. Labels dedupe by key, matching computeSdtBoundaries.
 */
export const computeSdtBoundaryLayers = (
  resolvedItems: readonly ResolvedPaintItem[],
  sdtLabelsRendered: Set<string>,
): Map<number, SdtBoundaryLayer[]> => {
  const layers = new Map<number, SdtBoundaryLayer[]>();

  const chains: (string | null)[][] = resolvedItems.map((item) => {
    if (item && 'sdtContainerKeys' in item) {
      const chain = (item as { sdtContainerKeys?: (string | null)[] }).sdtContainerKeys;
      if (chain && chain.length > 0) return chain;
    }
    if (item && 'sdtContainerKey' in item) {
      const key = (item as { sdtContainerKey?: string | null }).sdtContainerKey;
      if (key) return [key];
    }
    return [];
  });

  const fragmentOf = (idx: number): Fragment | null => {
    const item = resolvedItems[idx];
    return item && item.kind === 'fragment' ? item.fragment : null;
  };

  const keyAtDepth = (idx: number, depth: number): string | null => {
    const chain = chains[idx];
    return depth < chain.length ? chain[depth] : null;
  };

  const addLayer = (idx: number, layer: SdtBoundaryLayer): void => {
    const existing = layers.get(idx);
    if (existing) existing.push(layer);
    else layers.set(idx, [layer]);
  };

  const maxDepth = chains.reduce((max, chain) => Math.max(max, chain.length), 0);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    let i = 0;
    while (i < resolvedItems.length) {
      const currentKey = keyAtDepth(i, depth);
      const startFrag = fragmentOf(i);
      if (!currentKey || !startFrag) {
        i += 1;
        continue;
      }

      let groupRight = startFrag.x + startFrag.width;
      let j = i;
      while (j + 1 < resolvedItems.length && keyAtDepth(j + 1, depth) === currentKey) {
        j += 1;
        const nextFrag = fragmentOf(j);
        if (!nextFrag) break;
        const fragmentRight = nextFrag.x + nextFrag.width;
        if (fragmentRight > groupRight) groupRight = fragmentRight;
      }

      for (let k = i; k <= j; k += 1) {
        const fragment = fragmentOf(k);
        if (!fragment) continue;
        const isStart = k === i;
        const isEnd = k === j;

        let paddingBottomOverride: number | undefined;
        if (!isEnd) {
          const nextFragment = fragmentOf(k + 1);
          const currentHeight = (resolvedItems[k] as { height?: number } | undefined)?.height ?? 0;
          const currentBottom = fragment.y + currentHeight;
          if (nextFragment) {
            const gapToNext = nextFragment.y - currentBottom;
            if (gapToNext > 0) paddingBottomOverride = gapToNext;
          }
        }

        const showLabel = isStart && !sdtLabelsRendered.has(currentKey);
        if (showLabel) sdtLabelsRendered.add(currentKey);

        addLayer(k, {
          isStart,
          isEnd,
          widthOverride: groupRight - fragment.x,
          paddingBottomOverride,
          showLabel,
          key: currentKey,
          depth,
        });
      }

      i = j + 1;
    }
  }

  return layers;
};
