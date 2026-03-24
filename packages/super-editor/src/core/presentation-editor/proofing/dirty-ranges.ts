/**
 * Dirty Ranges
 *
 * Maps PM transaction changed ranges to affected proofing segment IDs.
 * Dirty segments get their cached hashes invalidated so the session
 * manager rechecks them on the next cycle.
 *
 * Rules:
 * - Changed ranges are expanded to enclosing paragraph-like segments
 * - Multi-paragraph edits invalidate all intersecting segments
 * - Paragraph split/merge invalidates adjacent boundary segments
 */

import type { ProofingSegment } from './types.js';

/**
 * Given the current segments and a set of changed PM ranges,
 * return the IDs of segments that need rechecking.
 */
export function computeDirtySegmentIds(
  segments: ProofingSegment[],
  changedRanges: Array<{ from: number; to: number }>,
): Set<string> {
  if (changedRanges.length === 0) return new Set();

  const dirty = new Set<string>();

  // Build a fast lookup: segment positions derived from segment IDs.
  // Segment IDs are `seg-{paraPos}`, so we can extract the PM position.
  const segmentPositions = segments
    .map((seg) => ({
      id: seg.id,
      pos: parseSegmentPos(seg.id),
    }))
    .filter((s) => s.pos !== null) as Array<{ id: string; pos: number }>;

  // Sort by position for binary search
  segmentPositions.sort((a, b) => a.pos - b.pos);

  for (const range of changedRanges) {
    // Find all segments whose paragraph position falls within or near the changed range.
    // A segment starting before range.to and the next segment starting after range.from
    // are both potentially affected.
    for (let i = 0; i < segmentPositions.length; i++) {
      const seg = segmentPositions[i];
      const nextSeg = segmentPositions[i + 1];

      // Segment's content region extends from seg.pos to the next segment's pos (or doc end).
      const segEnd = nextSeg ? nextSeg.pos : Infinity;

      // Check if this segment overlaps with the changed range
      if (seg.pos < range.to && segEnd > range.from) {
        dirty.add(seg.id);
      }

      // Also mark adjacent segments for boundary changes (split/merge)
      if (seg.pos <= range.from && segEnd >= range.from && i > 0) {
        dirty.add(segmentPositions[i - 1].id);
      }
    }
  }

  return dirty;
}

// =============================================================================
// Internal
// =============================================================================

/** Extract the PM position from a segment ID like "seg-42". */
function parseSegmentPos(segmentId: string): number | null {
  const match = segmentId.match(/^seg-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}
