import type { DrawingFragment, ResolvedDrawingItem } from '@superdoc/contracts';
import { requireResolvedBlockAndMeasure, type BlockMapEntry } from './resolvedBlockLookup.js';

/** Mirrors fragmentKey() for drawing fragments. */
function resolveDrawingFragmentId(fragment: DrawingFragment): string {
  return `drawing:${fragment.blockId}:${fragment.x}:${fragment.y}`;
}

/**
 * Resolves a drawing fragment into a ResolvedDrawingItem with the pre-extracted DrawingBlock.
 */
export function resolveDrawingItem(
  fragment: DrawingFragment,
  fragmentIndex: number,
  pageIndex: number,
  blockMap: Map<string, BlockMapEntry>,
): ResolvedDrawingItem {
  const { block } = requireResolvedBlockAndMeasure(blockMap, fragment.blockId, 'drawing', 'drawing', 'drawing');

  return {
    kind: 'fragment',
    fragmentKind: 'drawing',
    id: resolveDrawingFragmentId(fragment),
    pageIndex,
    x: fragment.x,
    y: fragment.y,
    width: fragment.width,
    height: fragment.height,
    zIndex: fragment.isAnchored ? fragment.zIndex : undefined,
    blockId: fragment.blockId,
    fragmentIndex,
    block,
  };
}
