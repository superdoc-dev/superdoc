import type { Fragment, ResolvedPaintItem } from '@superdoc/contracts';
import type { SdtBoundaryOptions } from './container.js';

const EMPTY_LABEL_KEYS: ReadonlySet<string> = new Set();

/**
 * The container-label keys a `computeSdtBoundaries` walk over `resolvedItems`
 * WOULD add to `sdtLabelsRendered`, without mutating it. This is the pure
 * "which labels does this page display" function the persistent-page reuse path
 * compares against recorded per-page label state: label placement is
 * cross-page prefix state that resolve stamps do not cover, so an untouched
 * reuse is only safe when the recorded labels equal this expectation.
 *
 * Implemented BY running `computeSdtBoundaries` on a scratch copy of the
 * prefix set (never a hand-maintained mirror), so the two can not drift.
 * Pages without container items take the allocation-free fast path.
 */
export const computeExpectedSdtLabelKeys = (
  resolvedItems: readonly ResolvedPaintItem[],
  sdtLabelsRendered: ReadonlySet<string>,
): ReadonlySet<string> => {
  let hasContainerItem = false;
  for (const item of resolvedItems) {
    if (item && 'sdtContainerKey' in item && (item as { sdtContainerKey?: string | null }).sdtContainerKey != null) {
      hasContainerItem = true;
      break;
    }
  }
  if (!hasContainerItem) return EMPTY_LABEL_KEYS;

  const scratch = new Set(sdtLabelsRendered);
  computeSdtBoundaries(resolvedItems, scratch);
  const expected = new Set<string>();
  for (const key of scratch) {
    if (!sdtLabelsRendered.has(key)) expected.add(key);
  }
  return expected;
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
