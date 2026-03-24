/**
 * Proofing Store
 *
 * Canonical in-memory store for current proofing issues.
 * Suppression (ignored words) is a derived filter, not a destructive mutation.
 * Suppressed issues remain in the store so they re-surface when the
 * ignored-words list changes.
 */

import type { StoredIssue, ProofingIssueKind } from './types.js';

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

  /** Remove all issues for the given segment IDs (used on dirty invalidation). */
  removeBySegmentIds(ids: Set<string>): void {
    for (const id of ids) {
      this.#issuesBySegment.delete(id);
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
   * spelling kind in v1.
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
  // Falls back to `message` only if `word` is not set (should not happen
  // in normal flow, but defensive).
  const raw = issue.word ?? issue.message;
  if (!raw) return false;

  const normalized = raw.normalize('NFC').toLowerCase();
  return normalizedIgnored.has(normalized);
}
