/**
 * Range Map
 *
 * Converts provider issue offsets (segment-local text positions)
 * back to ProseMirror document positions using the offset slices
 * produced by the segment extractor.
 */

import type { ProofingIssue, StoredIssue, OffsetSlice } from './types.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve an issue using pre-computed offset slices.
 * This is the preferred hot path during batch result processing.
 */
export function resolveIssuePmRangeFromSlices(issue: ProofingIssue, slices: OffsetSlice[]): StoredIssue | null {
  const pmFrom = textOffsetToPmPos(issue.start, slices);
  const pmTo = textOffsetToPmPos(issue.end, slices);

  if (pmFrom === null || pmTo === null || pmFrom >= pmTo) return null;

  return {
    ...issue,
    pmFrom,
    pmTo,
  };
}

// =============================================================================
// Internal
// =============================================================================

/**
 * Convert a text offset within a segment to the corresponding PM position.
 *
 * Walks the offset slices to find which slice contains the offset,
 * then interpolates the PM position within that slice.
 */
function textOffsetToPmPos(textOffset: number, slices: OffsetSlice[]): number | null {
  for (const slice of slices) {
    if (textOffset >= slice.textStart && textOffset <= slice.textEnd) {
      const delta = textOffset - slice.textStart;
      return slice.pmFrom + delta;
    }
  }

  // Offset falls in an unmapped gap (e.g., a boundary space).
  // Try to find the closest mapped position after the gap.
  for (const slice of slices) {
    if (slice.textStart >= textOffset) {
      return slice.pmFrom;
    }
  }

  // If offset is at the very end, use the last slice's end
  if (slices.length > 0) {
    const last = slices[slices.length - 1];
    if (textOffset >= last.textEnd) {
      return last.pmTo;
    }
  }

  return null;
}
