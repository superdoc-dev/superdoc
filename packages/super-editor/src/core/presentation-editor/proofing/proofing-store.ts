/**
 * Proofing Store
 *
 * Canonical in-memory store for current proofing issues.
 * Suppression (ignored words) is a derived filter, not a destructive mutation.
 * Suppressed issues remain in the store so they re-surface when the
 * ignored-words list changes.
 */

import type { StoredIssue } from './types.js';
import type { Mapping } from 'prosemirror-transform';

export class ProofingStore {
  /** All issues, including suppressed ones. Keyed by segmentId for fast invalidation. */
  #issuesBySegment = new Map<string, StoredIssue[]>();

  // ===========================================================================
  // Mutations
  // ===========================================================================

  /** Add a validated, PM-range-resolved issue to the store. */
  addIssue(issue: StoredIssue): void {
    const list = this.#issuesBySegment.get(issue.segmentId);
    if (list) {
      list.push(issue);
    } else {
      this.#issuesBySegment.set(issue.segmentId, [issue]);
    }
  }

  /**
   * Remap issues for dirty segments through a PM transaction mapping.
   * Issues where the mapped range collapses or is deleted are dropped.
   * Surviving issues are marked as 'mapped' with the given recheckId.
   *
   * Uses left bias for pmFrom and right bias for pmTo so the issue
   * range expands outward at insertion boundaries rather than collapsing.
   */
  remapIssues(segmentIds: Set<string>, mapping: Mapping, recheckId: number): void {
    for (const id of segmentIds) {
      const list = this.#issuesBySegment.get(id);
      if (!list) continue;

      const surviving: StoredIssue[] = [];
      for (const issue of list) {
        const fromResult = mapping.mapResult(issue.pmFrom, -1);
        const toResult = mapping.mapResult(issue.pmTo, 1);

        // Drop if either endpoint was deleted or range collapsed
        if (fromResult.deleted || toResult.deleted) continue;
        if (fromResult.pos >= toResult.pos) continue;

        issue.pmFrom = fromResult.pos;
        issue.pmTo = toResult.pos;
        issue.state = 'mapped';
        issue.recheckId = recheckId;
        surviving.push(issue);
      }

      if (surviving.length > 0) {
        this.#issuesBySegment.set(id, surviving);
      } else {
        this.#issuesBySegment.delete(id);
      }
    }
  }

  /**
   * Replace mapped issues for a batch of segments with fresh confirmed results.
   *
   * Only removes issues matching the given recheckIds AND belonging to the
   * covered segment IDs. This preserves display continuity for multi-batch
   * checks: each batch only replaces its own segments, leaving mapped issues
   * for other batches' segments visible until those batches complete.
   *
   * Orphaned old-segment-ID issues (from split/merge) are cleaned up
   * separately by removeOrphanedSegments() in onDocumentChanged().
   */
  replaceBatchResults(recheckIds: Set<number>, coveredSegmentIds: Set<string>, freshIssues: StoredIssue[]): void {
    for (const segId of coveredSegmentIds) {
      const list = this.#issuesBySegment.get(segId);
      if (!list) continue;
      const filtered = list.filter((issue) => issue.recheckId === null || !recheckIds.has(issue.recheckId));
      if (filtered.length > 0) {
        this.#issuesBySegment.set(segId, filtered);
      } else {
        this.#issuesBySegment.delete(segId);
      }
    }

    for (const issue of freshIssues) {
      this.addIssue(issue);
    }
  }

  /** Remove all issues for the given segment IDs. */
  removeBySegmentIds(ids: Set<string>): void {
    for (const id of ids) {
      this.#issuesBySegment.delete(id);
    }
  }

  /**
   * Remove issues whose segment ID is not in the current document.
   * Handles paragraph merge/remove where old segment IDs vanish entirely.
   */
  removeOrphanedSegments(currentSegmentIds: Set<string>): void {
    for (const segId of this.#issuesBySegment.keys()) {
      if (!currentSegmentIds.has(segId)) {
        this.#issuesBySegment.delete(segId);
      }
    }
  }

  /** Clear all stored issues. */
  clear(): void {
    this.#issuesBySegment.clear();
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /** Get all stored issues (including suppressed). */
  getAllIssues(): StoredIssue[] {
    const result: StoredIssue[] = [];
    for (const list of this.#issuesBySegment.values()) {
      result.push(...list);
    }
    return result;
  }

  /**
   * Get display-ready issues: filtered by suppression and restricted to
   * spelling kind in v1. Returns both confirmed and mapped issues.
   *
   * Suppression uses case-insensitive, NFC-normalized matching.
   */
  getDisplayIssues(ignoredWords: string[]): StoredIssue[] {
    const normalizedIgnored = new Set(ignoredWords.map((w) => w.normalize('NFC').toLowerCase()));

    const result: StoredIssue[] = [];
    for (const list of this.#issuesBySegment.values()) {
      for (const issue of list) {
        // v1: only render spelling issues
        if (issue.kind !== 'spelling') continue;

        // Check suppression: the issue's word is derived from offsets
        if (isSuppressed(issue, normalizedIgnored)) continue;

        result.push(issue);
      }
    }
    return result;
  }

  /** Collect the set of recheckIds currently present on mapped issues. */
  getActiveRecheckIds(): Set<number> {
    const ids = new Set<number>();
    for (const list of this.#issuesBySegment.values()) {
      for (const issue of list) {
        if (issue.state === 'mapped' && issue.recheckId !== null) {
          ids.add(issue.recheckId);
        }
      }
    }
    return ids;
  }

  /** Check if the store has any issues (including suppressed). */
  get isEmpty(): boolean {
    return this.#issuesBySegment.size === 0;
  }

  /** Total issue count (including suppressed). */
  get size(): number {
    let count = 0;
    for (const list of this.#issuesBySegment.values()) {
      count += list.length;
    }
    return count;
  }
}

// =============================================================================
// Internal
// =============================================================================

/**
 * Check if an issue is suppressed by the ignored-words list.
 * Uses case-insensitive, NFC-normalized matching on the issue's `word` field,
 * which is derived from the segment text using issue offsets (not issue.message).
 */
function isSuppressed(issue: StoredIssue, normalizedIgnored: Set<string>): boolean {
  if (normalizedIgnored.size === 0) return false;

  // Use the derived `word` field (extracted from segment text via offsets).
  // Falls back to `message` only if `word` is not set.
  const raw = issue.word ?? issue.message;
  if (!raw) return false;

  const normalized = raw.normalize('NFC').toLowerCase();
  return normalizedIgnored.has(normalized);
}
