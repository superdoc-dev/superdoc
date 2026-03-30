import type { ImageFragment, ResolvedImageItem } from '@superdoc/contracts';
import { requireResolvedBlockAndMeasure, type BlockMapEntry } from './resolvedBlockLookup.js';

/** Mirrors fragmentKey() for image fragments. */
function resolveImageFragmentId(fragment: ImageFragment): string {
  return `image:${fragment.blockId}:${fragment.x}:${fragment.y}`;
}

/**
 * Resolves an image fragment into a ResolvedImageItem with the pre-extracted ImageBlock.
 */
export function resolveImageItem(
  fragment: ImageFragment,
  fragmentIndex: number,
  pageIndex: number,
  blockMap: Map<string, BlockMapEntry>,
): ResolvedImageItem {
  const { block } = requireResolvedBlockAndMeasure(blockMap, fragment.blockId, 'image', 'image', 'image');

  return {
    kind: 'fragment',
    fragmentKind: 'image',
    id: resolveImageFragmentId(fragment),
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
