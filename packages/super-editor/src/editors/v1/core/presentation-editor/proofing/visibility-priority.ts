/**
 * Visibility Priority
 *
 * Sorts proofing segments so visible-page segments are checked first,
 * with graceful fallback to document order when visibility data is unavailable.
 */

import type { ProofingSegment } from './types.js';
import type { VisibilitySource } from './visibility-source.js';

/**
 * Reorder segments so those on visible pages come first.
 * Segments without page metadata or on non-visible pages are appended in document order.
 */
export function prioritizeByVisibility(
  segments: ProofingSegment[],
  visibilitySource: VisibilitySource,
): ProofingSegment[] {
  const visiblePages = visibilitySource.getVisiblePageIndices();

  // Graceful fallback: no visibility data → document order
  if (!visiblePages || visiblePages.length === 0) return segments;

  const visibleSet = new Set(visiblePages);
  const visible: ProofingSegment[] = [];
  const rest: ProofingSegment[] = [];

  for (const seg of segments) {
    const pageIndex = seg.metadata.pageIndex;
    if (pageIndex !== undefined && visibleSet.has(pageIndex)) {
      visible.push(seg);
    } else {
      rest.push(seg);
    }
  }

  return [...visible, ...rest];
}
