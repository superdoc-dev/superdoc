/**
 * Delete range expansion for `behavior: 'selection'`.
 *
 * When a boundary block is fully covered by the resolved selection, the
 * selection is expanded to include the block's structural edges so the
 * entire node is removed — matching the behavior of selecting text in
 * the editor and pressing backspace.
 *
 * Expansion is evaluated per-endpoint, not all-or-nothing. An explicit
 * `nodeEdge` endpoint is already at a block boundary and never expands.
 * Only `text` endpoints that fully cover their boundary block expand.
 */

import type { SelectionPoint } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import { getBlockIndex } from './index-cache.js';
import { findBlockByPos, isTextBlockCandidate, type BlockCandidate } from './node-address-resolver.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExpandedRange {
  absFrom: number;
  absTo: number;
}

/**
 * Optionally expands a resolved selection range to include fully-covered
 * boundary blocks.
 *
 * @param editor  - The editor instance (for document and block index access).
 * @param absFrom - Resolved absolute start position.
 * @param absTo   - Resolved absolute end position.
 * @param start   - The original start selection point (used to determine expansion eligibility).
 * @param end     - The original end selection point (used to determine expansion eligibility).
 * @returns The (possibly expanded) range.
 */
export function expandDeleteSelection(
  editor: Editor,
  absFrom: number,
  absTo: number,
  start: SelectionPoint,
  end: SelectionPoint,
): ExpandedRange {
  // Collapsed selections — nothing to expand.
  if (absFrom === absTo) return { absFrom, absTo };

  const index = getBlockIndex(editor);

  const expandedFrom = maybeExpandStart(index, absFrom, start);
  const expandedTo = maybeExpandEnd(index, absTo, end);

  return { absFrom: expandedFrom, absTo: expandedTo };
}

// ---------------------------------------------------------------------------
// Per-endpoint expansion
// ---------------------------------------------------------------------------

/**
 * Expands the start endpoint to the block's structural start position
 * if the boundary block is fully covered by the selection.
 *
 * nodeEdge endpoints are already at block boundaries — no expansion needed.
 */
function maybeExpandStart(index: ReturnType<typeof getBlockIndex>, absFrom: number, point: SelectionPoint): number {
  // nodeEdge is already at a block boundary.
  if (point.kind === 'nodeEdge') return absFrom;

  const block = findInnermostTextBlock(index, absFrom);
  if (!block) return absFrom;

  // Only expand if the selection starts at or before the block's content start.
  // Content start = block.pos + 1 (skip the opening token of the node).
  const contentStart = block.pos + 1;
  if (absFrom <= contentStart) {
    return block.pos;
  }

  return absFrom;
}

/**
 * Expands the end endpoint to the block's structural end position
 * if the boundary block is fully covered by the selection.
 *
 * nodeEdge endpoints are already at block boundaries — no expansion needed.
 */
function maybeExpandEnd(index: ReturnType<typeof getBlockIndex>, absTo: number, point: SelectionPoint): number {
  // nodeEdge is already at a block boundary.
  if (point.kind === 'nodeEdge') return absTo;

  const block = findInnermostTextBlock(index, absTo);
  if (!block) return absTo;

  // Content end = block.end - 1 (skip the closing token of the node).
  const contentEnd = block.end - 1;
  if (absTo >= contentEnd) {
    return block.end;
  }

  return absTo;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds the innermost text block containing the given position.
 *
 * The block index may contain nested blocks (e.g. table > row > cell > paragraph).
 * We want the innermost text block because expansion should be bounded by
 * the direct container of the text content.
 */
function findInnermostTextBlock(index: ReturnType<typeof getBlockIndex>, pos: number): BlockCandidate | undefined {
  // Walk candidates to find the innermost text block containing pos.
  // Candidates are ordered by document position. We find all containing
  // candidates and pick the smallest (most nested) text block.
  let best: BlockCandidate | undefined;

  // Start with a quick binary search hit.
  const initial = findBlockByPos(index, pos);
  if (!initial) return undefined;

  // Check all candidates that contain this position, looking for
  // the innermost text block.
  for (const candidate of index.candidates) {
    if (candidate.pos > pos) break; // Past the position — stop scanning.
    if (candidate.end < pos) continue; // Doesn't contain the position.

    if (!isTextBlockCandidate(candidate)) continue;

    // Prefer the candidate with the smallest range (most nested).
    if (!best || candidate.end - candidate.pos < best.end - best.pos) {
      best = candidate;
    }
  }

  return best;
}
