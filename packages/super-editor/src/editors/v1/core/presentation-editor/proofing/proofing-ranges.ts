/**
 * Proofing Ranges
 *
 * Converts stored issues into non-overlapping paint slices for rendering.
 * Provider issues can overlap, duplicate, or span mixed kinds — this module
 * normalizes them into deterministic, non-overlapping input for the
 * decoration pass.
 *
 * v1 rule: only 'spelling' issues are painted. Grammar/style issues are
 * stored but not rendered.
 */

import type { StoredIssue, ProofingPaintSlice } from './types.js';

/**
 * Build non-overlapping paint slices from display-ready issues.
 *
 * Overlapping spelling ranges are unioned. Each slice carries a reference
 * to the primary issue (first by PM position) for context-menu resolution.
 */
export function buildPaintSlices(issues: StoredIssue[]): ProofingPaintSlice[] {
  // Filter to spelling only (v1). getDisplayIssues already applies this filter,
  // but this is a public export — the guard protects direct callers.
  const spellingIssues = issues.filter((i) => i.kind === 'spelling');
  if (spellingIssues.length === 0) return [];

  // Sort by pmFrom ascending, then pmTo ascending
  const sorted = [...spellingIssues].sort((a, b) => a.pmFrom - b.pmFrom || a.pmTo - b.pmTo);

  // Merge overlapping ranges into non-overlapping slices
  const slices: ProofingPaintSlice[] = [];
  let current: ProofingPaintSlice | null = null;

  for (const issue of sorted) {
    if (!current) {
      current = {
        pmFrom: issue.pmFrom,
        pmTo: issue.pmTo,
        kind: 'spelling',
        issue, // First issue is the primary
      };
      continue;
    }

    // Check for overlap (current end >= next start)
    if (issue.pmFrom <= current.pmTo) {
      // Extend the current slice to cover both ranges
      current.pmTo = Math.max(current.pmTo, issue.pmTo);
      // Primary issue remains the first one (by position)
    } else {
      // No overlap — push current and start new
      slices.push(current);
      current = {
        pmFrom: issue.pmFrom,
        pmTo: issue.pmTo,
        kind: 'spelling',
        issue,
      };
    }
  }

  if (current) {
    slices.push(current);
  }

  return slices;
}

/**
 * Find the paint slice at a given PM position.
 * Returns the slice and its primary issue, or null.
 */
export function findSliceAtPosition(slices: ProofingPaintSlice[], pmPos: number): ProofingPaintSlice | null {
  // Binary search since slices are sorted by pmFrom
  let lo = 0;
  let hi = slices.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const slice = slices[mid];

    if (pmPos < slice.pmFrom) {
      hi = mid - 1;
    } else if (pmPos >= slice.pmTo) {
      lo = mid + 1;
    } else {
      return slice;
    }
  }

  return null;
}
