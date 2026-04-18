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
 * Given the current segments, their paragraph positions, and a set of
 * changed PM ranges, return the IDs of segments that need rechecking.
 *
 * @param segments - Current proofing segments (from extraction)
 * @param segmentPositions - Map of segment ID → paragraph start position
 * @param changedRanges - PM ranges affected by the transaction
 */
export function computeDirtySegmentIds(
  segments: ProofingSegment[],
  segmentPositions: Map<string, number>,
  changedRanges: Array<{ from: number; to: number }>,
): Set<string> {
  if (changedRanges.length === 0) return new Set();

  const dirty = new Set<string>();

  // Build a sorted list of (id, position) for range matching
  const sorted = segments
    .map((seg) => ({ id: seg.id, pos: segmentPositions.get(seg.id) ?? -1 }))
    .filter((s) => s.pos >= 0)
    .sort((a, b) => a.pos - b.pos);

  for (const range of changedRanges) {
    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i];
      const segEnd = sorted[i + 1]?.pos ?? Infinity;

      // Check if this segment overlaps with the changed range
      if (seg.pos < range.to && segEnd > range.from) {
        dirty.add(seg.id);
      }

      // Also mark adjacent segment for boundary changes (split/merge)
      if (seg.pos <= range.from && segEnd >= range.from && i > 0) {
        dirty.add(sorted[i - 1].id);
      }
    }
  }

  return dirty;
}
