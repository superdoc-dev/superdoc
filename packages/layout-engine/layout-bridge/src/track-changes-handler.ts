/**
 * Track Changes Handler
 *
 * Handles cursor positioning and visual position calculations when track changes
 * are enabled, accounting for deleted text that affects visual layout.
 *
 * Strategy:
 * 1. Extract track change spans from document
 * 2. Calculate visual positions ignoring deleted text
 * 3. Provide cursor offset adjustments
 * 4. Support both insertion and deletion tracking
 *
 * @module track-changes-handler
 */

/**
 * Minimal ProseMirror Node interface for track changes extraction.
 * This is a subset of the actual ProseMirror Node type.
 */
interface PMNode {
  nodeSize: number;
  marks?: Array<{
    type: { name: string };
    attrs?: Record<string, unknown>;
  }>;
  descendants?: (callback: (node: PMNode, pos: number) => boolean | void) => void;
}

/**
 * A span of tracked changes in the document.
 */
export interface TrackChangeSpan {
  /** PM start position */
  pmStart: number;
  /** PM end position */
  pmEnd: number;
  /** Type of change */
  type: 'insertion' | 'deletion';
  /** Author of the change */
  author: string;
}

/**
 * TrackChangesHandler provides cursor positioning utilities for documents
 * with track changes enabled.
 */
export class TrackChangesHandler {
  /**
   * Extract track change spans from ProseMirror document state.
   *
   * @param doc - ProseMirror document node
   * @returns Array of track change spans
   */
  extractSpans(doc: PMNode): TrackChangeSpan[] {
    const spans: TrackChangeSpan[] = [];

    // Walk document and extract track change marks
    doc.descendants?.((node: PMNode, nodePos: number) => {
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type.name === 'tracked_insert' || mark.type.name === 'tracked_delete') {
            spans.push({
              pmStart: nodePos,
              pmEnd: nodePos + node.nodeSize,
              type: mark.type.name === 'tracked_insert' ? 'insertion' : 'deletion',
              author: (mark.attrs?.author as string) || 'unknown',
            });
          }
        }
      }
      return true;
    });

    return spans;
  }

  /**
   * Calculate visual position ignoring deleted text.
   * Deleted text doesn't contribute to visual position when rendered.
   *
   * @param pmPos - ProseMirror position
   * @param spans - Track change spans
   * @returns Visual position (accounting for hidden deletions)
   */
  getVisualPosition(pmPos: number, spans: TrackChangeSpan[]): number {
    let visualPos = pmPos;

    for (const span of spans) {
      if (span.type === 'deletion') {
        // If position is after this deletion, subtract its length
        if (pmPos >= span.pmEnd) {
          visualPos -= span.pmEnd - span.pmStart;
        }
        // If position is within deletion, clamp to deletion start
        else if (pmPos > span.pmStart && pmPos < span.pmEnd) {
          visualPos = span.pmStart;
        }
      }
    }

    return Math.max(0, visualPos);
  }

  /**
   * Get cursor offset adjustment for track changes.
   * Returns how many positions to adjust cursor due to deleted text.
   *
   * @param pmPos - ProseMirror position
   * @param spans - Track change spans
   * @returns Offset adjustment (negative for positions after deletions)
   */
  getCursorAdjustment(pmPos: number, spans: TrackChangeSpan[]): number {
    let adjustment = 0;

    for (const span of spans) {
      if (span.type === 'deletion' && pmPos >= span.pmEnd) {
        adjustment -= span.pmEnd - span.pmStart;
      }
    }

    return adjustment;
  }

  /**
   * Check if a position is within a deletion.
   *
   * @param pmPos - ProseMirror position
   * @param spans - Track change spans
   * @returns True if position is inside deleted text
   */
  isInDeletion(pmPos: number, spans: TrackChangeSpan[]): boolean {
    return spans.some((span) => span.type === 'deletion' && pmPos >= span.pmStart && pmPos < span.pmEnd);
  }

  /**
   * Get all deletions affecting a range.
   *
   * @param startPos - Range start position
   * @param endPos - Range end position
   * @param spans - Track change spans
   * @returns Array of deletion spans that intersect the range
   */
  getDeletionsInRange(startPos: number, endPos: number, spans: TrackChangeSpan[]): TrackChangeSpan[] {
    return spans.filter((span) => span.type === 'deletion' && span.pmStart < endPos && span.pmEnd > startPos);
  }
}
