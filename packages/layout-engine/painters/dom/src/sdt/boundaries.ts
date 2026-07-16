import type { Fragment, ResolvedPaintItem, SdtMetadata } from '@superdoc/contracts';
import { getSdtContainerKey } from '@superdoc/contracts';
import { computeOwnContainerFlags, type SdtBoundaryOptions } from './container.js';

type SdtAttrsCandidate = {
  attrs?: {
    sdt?: SdtMetadata | null;
  } | null;
};

const getOwnContainerKey = (item: ResolvedPaintItem): string | null => {
  if (item.kind !== 'fragment') return null;

  const fragment = item.fragment;
  const block = item.block;
  if (!block) return null;

  if (fragment.kind === 'list-item' && block.kind === 'list') {
    const listItem = block.items.find((candidate) => candidate.id === fragment.itemId);
    return getSdtContainerKey(listItem?.paragraph.attrs?.sdt);
  }

  if ('attrs' in block) {
    return getSdtContainerKey((block as SdtAttrsCandidate).attrs?.sdt);
  }

  return null;
};

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
  const ownContainerKeys: (string | null)[] = resolvedItems.map((item) => getOwnContainerKey(item));

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

      const ownKey = ownContainerKeys[k];
      const previousOwnKey = k > 0 ? ownContainerKeys[k - 1] : null;
      const nextOwnKey = k + 1 < ownContainerKeys.length ? ownContainerKeys[k + 1] : null;
      const nextContainerKey = k + 1 < containerKeys.length ? containerKeys[k + 1] : null;
      const ownFlags = computeOwnContainerFlags({
        containerKey: currentKey,
        ownContainerKey: ownKey,
        previousOwnContainerKey: previousOwnKey,
        nextOwnContainerKey: nextOwnKey,
        nextContainerKey,
        sdtLabelsRendered,
      });

      boundaries.set(k, {
        isStart,
        isEnd,
        widthOverride: groupRight - fragment.x,
        paddingBottomOverride,
        ...ownFlags,
      });
    }

    i = j + 1;
  }

  return boundaries;
};
