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
