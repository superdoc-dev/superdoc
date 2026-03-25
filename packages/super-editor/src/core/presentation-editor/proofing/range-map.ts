/**
 * Range Map
 *
 * Converts provider issue offsets (segment-local text positions)
 * back to ProseMirror document positions using the offset slices
 * produced by the segment extractor.
 */

import type { ProofingIssue, OffsetSlice } from './types.js';

/** Issue with resolved PM positions, before lifecycle state is assigned by the caller. */
export type ResolvedIssue = ProofingIssue & { pmFrom: number; pmTo: number };

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve an issue's text offsets into PM positions using pre-computed offset slices.
 * Returns the issue with pmFrom/pmTo, or null if the range can't be mapped.
 * The caller assigns `state`, `recheckId`, and `word` to produce a full StoredIssue.
 */
export function resolveIssuePmRangeFromSlices(issue: ProofingIssue, slices: OffsetSlice[]): ResolvedIssue | null {
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
