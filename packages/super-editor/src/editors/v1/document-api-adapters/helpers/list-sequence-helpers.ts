/**
 * List sequence helpers — utility functions for reasoning about contiguous
 * numbering sequences in a document.
 *
 * A "contiguous sequence" is a run of list items sharing the same numId,
 * where non-list paragraphs between them do NOT break the sequence but
 * list items with a different numId DO.
 */

import type { Editor } from '../../core/Editor.js';
import type { CanContinueReason, CanJoinReason, JoinDirection } from '@superdoc/document-api';
import { type ListItemProjection, projectListItemCandidate } from './list-item-resolver.js';
import { getBlockIndex } from './index-cache.js';
import type { BlockCandidate } from './node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Block resolution (for BlockAddress targets)
// ---------------------------------------------------------------------------

/**
 * Resolve a paragraph block address to its BlockCandidate.
 * Searches for both 'paragraph' and 'listItem' node types since a paragraph
 * with numbering properties is classified as 'listItem' in the block index.
 */
export function resolveBlock(editor: Editor, nodeId: string): BlockCandidate {
  const index = getBlockIndex(editor);
  const matches = index.candidates.filter(
    (c) => c.nodeId === nodeId && (c.nodeType === 'paragraph' || c.nodeType === 'listItem'),
  );

  if (matches.length === 0) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Block target was not found.', { nodeId });
  }
  if (matches.length > 1) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Block target id is ambiguous.', {
      nodeId,
      count: matches.length,
    });
  }

  return matches[0]!;
}

/**
 * Resolve a contiguous range of paragraphs between `from` and `to` (inclusive).
 * Returns all paragraph/listItem candidates whose positions fall within the range.
 */
export function resolveBlocksInRange(editor: Editor, fromId: string, toId: string): BlockCandidate[] {
  const from = resolveBlock(editor, fromId);
  const to = resolveBlock(editor, toId);

  if (from.pos > to.pos) {
    throw new DocumentApiAdapterError('INVALID_TARGET', 'Block range "from" must precede "to" in document order.', {
      from: fromId,
      to: toId,
    });
  }

  const index = getBlockIndex(editor);
  return index.candidates.filter(
    (c) => (c.nodeType === 'paragraph' || c.nodeType === 'listItem') && c.pos >= from.pos && c.pos <= to.pos,
  );
}

// ---------------------------------------------------------------------------
// Numbering definition resolution
// ---------------------------------------------------------------------------

/**
 * Get the abstractNumId for a given numId from the raw numbering definitions.
 */
export function getAbstractNumId(editor: Editor, numId: number): number | undefined {
  const converter = editor as unknown as { converter?: { numbering?: { definitions?: Record<number, any> } } };
  const definitions = converter.converter?.numbering?.definitions;
  if (!definitions) return undefined;

  const numDef = definitions[numId];
  if (!numDef?.elements) return undefined;

  const abstractEl = numDef.elements.find((el: any) => el.name === 'w:abstractNumId');
  const val = abstractEl?.attributes?.['w:val'];
  return val != null ? Number(val) : undefined;
}

// ---------------------------------------------------------------------------
// Sequence operations
// ---------------------------------------------------------------------------

/**
 * Get all list item projections from the block index, ordered by document position.
 */
export function getAllListItemProjections(editor: Editor): ListItemProjection[] {
  const index = getBlockIndex(editor);
  return index.candidates.filter((c) => c.nodeType === 'listItem').map((c) => projectListItemCandidate(editor, c));
}

/**
 * Get the full contiguous sequence containing the target item.
 * "Contiguous" means consecutive list items with the same numId —
 * non-list paragraphs don't break continuity, but items with a
 * different numId do.
 */
export function getContiguousSequence(editor: Editor, target: ListItemProjection): ListItemProjection[] {
  if (target.numId == null) return [target];

  const allItems = getAllListItemProjections(editor);
  const targetIdx = allItems.findIndex((item) => item.address.nodeId === target.address.nodeId);
  if (targetIdx === -1) return [target];

  const numId = target.numId;

  // Walk backward to find start
  let startIdx = targetIdx;
  for (let i = targetIdx - 1; i >= 0; i--) {
    if (allItems[i]!.numId !== numId) break;
    startIdx = i;
  }

  // Walk forward to find end
  let endIdx = targetIdx;
  for (let i = targetIdx + 1; i < allItems.length; i++) {
    if (allItems[i]!.numId !== numId) break;
    endIdx = i;
  }

  return allItems.slice(startIdx, endIdx + 1);
}

/**
 * Get items from the target to the end of its contiguous sequence.
 */
export function getSequenceFromTarget(editor: Editor, target: ListItemProjection): ListItemProjection[] {
  const sequence = getContiguousSequence(editor, target);
  const targetIdx = sequence.findIndex((item) => item.address.nodeId === target.address.nodeId);
  return sequence.slice(targetIdx);
}

/**
 * Check if the target is the first item in its contiguous sequence.
 */
export function isFirstInSequence(editor: Editor, target: ListItemProjection): boolean {
  const sequence = getContiguousSequence(editor, target);
  return sequence.length > 0 && sequence[0]!.address.nodeId === target.address.nodeId;
}

// ---------------------------------------------------------------------------
// Sequence identity
// ---------------------------------------------------------------------------

/**
 * Compute the sequence identity for a single list item.
 *
 * Format: `{numId}:{anchorNodeId}` — encodes both the numbering definition
 * and the position anchor (nodeId of the first item in the contiguous
 * sequence). Distinct visual sequences sharing one numId receive different
 * IDs because their anchors differ.
 */
export function computeSequenceId(editor: Editor, projection: ListItemProjection): string {
  if (projection.numId == null) return '';
  const sequence = getContiguousSequence(editor, projection);
  const anchor = sequence[0]?.address.nodeId ?? projection.address.nodeId;
  return `${projection.numId}:${anchor}`;
}

/**
 * Batch-compute sequence IDs for an ordered array of list item projections.
 *
 * Runs in a single O(n) pass — contiguous items sharing the same numId are
 * assigned the same sequence ID, anchored on the first item's nodeId. A
 * different numId (or a null numId) starts a new sequence.
 */
export function computeSequenceIdMap(items: ListItemProjection[]): Map<string, string> {
  const map = new Map<string, string>();
  let currentNumId: number | undefined;
  let currentAnchor: string | undefined;

  for (const item of items) {
    if (item.numId == null) {
      map.set(item.address.nodeId, '');
      currentNumId = undefined;
      currentAnchor = undefined;
      continue;
    }

    if (item.numId !== currentNumId) {
      currentNumId = item.numId;
      currentAnchor = item.address.nodeId;
    }

    map.set(item.address.nodeId, `${currentNumId}:${currentAnchor}`);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Adjacency search
// ---------------------------------------------------------------------------

export type AdjacentSequenceResult = {
  sequence: ListItemProjection[];
  numId: number;
  abstractNumId: number | undefined;
};

/**
 * Find the adjacent list sequence in the given direction.
 * Returns null if no adjacent sequence exists.
 */
export function findAdjacentSequence(
  editor: Editor,
  target: ListItemProjection,
  direction: JoinDirection,
): AdjacentSequenceResult | null {
  if (target.numId == null) return null;

  const allItems = getAllListItemProjections(editor);
  const sequence = getContiguousSequence(editor, target);

  if (direction === 'withNext') {
    const lastInSequence = sequence[sequence.length - 1]!;
    const lastIdx = allItems.findIndex((item) => item.address.nodeId === lastInSequence.address.nodeId);

    for (let i = lastIdx + 1; i < allItems.length; i++) {
      const item = allItems[i]!;
      if (item.numId != null) {
        const adjSequence = getContiguousSequence(editor, item);
        return {
          sequence: adjSequence,
          numId: item.numId,
          abstractNumId: getAbstractNumId(editor, item.numId),
        };
      }
    }
  } else {
    const firstInSequence = sequence[0]!;
    const firstIdx = allItems.findIndex((item) => item.address.nodeId === firstInSequence.address.nodeId);

    for (let i = firstIdx - 1; i >= 0; i--) {
      const item = allItems[i]!;
      if (item.numId != null) {
        const adjSequence = getContiguousSequence(editor, item);
        return {
          sequence: adjSequence,
          numId: item.numId,
          abstractNumId: getAbstractNumId(editor, item.numId),
        };
      }
    }
  }

  return null;
}

/**
 * Find the nearest previous list sequence that shares the same abstractNumId.
 * Used by continuePrevious to find a compatible sequence to merge with.
 */
export function findPreviousCompatibleSequence(
  editor: Editor,
  target: ListItemProjection,
): { sequence: ListItemProjection[]; numId: number } | null {
  if (target.numId == null) return null;

  const targetAbstractId = getAbstractNumId(editor, target.numId);
  if (targetAbstractId == null) return null;

  const allItems = getAllListItemProjections(editor);
  const sequence = getContiguousSequence(editor, target);
  const firstInSequence = sequence[0]!;
  const firstIdx = allItems.findIndex((item) => item.address.nodeId === firstInSequence.address.nodeId);

  for (let i = firstIdx - 1; i >= 0; i--) {
    const item = allItems[i]!;
    if (item.numId == null) continue;

    const itemAbstractId = getAbstractNumId(editor, item.numId);
    if (itemAbstractId === targetAbstractId && item.numId !== target.numId) {
      return {
        sequence: getContiguousSequence(editor, item),
        numId: item.numId,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Preflight evaluators (canJoin, canContinuePrevious)
// ---------------------------------------------------------------------------

/**
 * Determine canJoin result for the given target and direction.
 */
export function evaluateCanJoin(
  editor: Editor,
  target: ListItemProjection,
  direction: JoinDirection,
): { canJoin: boolean; reason?: CanJoinReason; adjacentListId?: string } {
  const adjacent = findAdjacentSequence(editor, target, direction);

  if (!adjacent) {
    return { canJoin: false, reason: 'NO_ADJACENT_SEQUENCE' };
  }

  if (adjacent.numId === target.numId) {
    return { canJoin: false, reason: 'ALREADY_SAME_SEQUENCE' };
  }

  const targetAbstractId = target.numId != null ? getAbstractNumId(editor, target.numId) : undefined;
  if (targetAbstractId == null || adjacent.abstractNumId == null || targetAbstractId !== adjacent.abstractNumId) {
    return { canJoin: false, reason: 'INCOMPATIBLE_DEFINITIONS' };
  }

  const adjacentAnchor = adjacent.sequence[0]?.address.nodeId ?? '';
  return { canJoin: true, adjacentListId: `${adjacent.numId}:${adjacentAnchor}` };
}

/**
 * Determine canContinuePrevious result for the given target.
 */
export function evaluateCanContinuePrevious(
  editor: Editor,
  target: ListItemProjection,
): { canContinue: boolean; reason?: CanContinueReason; previousListId?: string } {
  if (target.numId == null) {
    return { canContinue: false, reason: 'NO_PREVIOUS_LIST' };
  }

  const targetAbstractId = getAbstractNumId(editor, target.numId);
  if (targetAbstractId == null) {
    return { canContinue: false, reason: 'NO_PREVIOUS_LIST' };
  }

  const allItems = getAllListItemProjections(editor);
  const sequence = getContiguousSequence(editor, target);
  const firstInSequence = sequence[0]!;
  const firstIdx = allItems.findIndex((item) => item.address.nodeId === firstInSequence.address.nodeId);

  let foundAnyPrevious = false;

  for (let i = firstIdx - 1; i >= 0; i--) {
    const item = allItems[i]!;
    if (item.numId == null) continue;

    foundAnyPrevious = true;

    const itemAbstractId = getAbstractNumId(editor, item.numId);
    if (itemAbstractId !== targetAbstractId) continue;

    // Compatible previous found
    if (item.numId === target.numId) {
      return { canContinue: false, reason: 'ALREADY_CONTINUOUS' };
    }

    const prevSequence = getContiguousSequence(editor, item);
    const prevAnchor = prevSequence[0]?.address.nodeId ?? item.address.nodeId;
    return { canContinue: true, previousListId: `${item.numId}:${prevAnchor}` };
  }

  if (!foundAnyPrevious) {
    return { canContinue: false, reason: 'NO_PREVIOUS_LIST' };
  }

  return { canContinue: false, reason: 'INCOMPATIBLE_DEFINITIONS' };
}
