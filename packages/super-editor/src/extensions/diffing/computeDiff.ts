import type { Node as PMNode, Schema } from 'prosemirror-model';
import { diffNodes, type NodeDiff } from './algorithm/generic-diffing.ts';

/**
 * Placeholder type for comment diffs until comment diffing is implemented.
 */
export type CommentDiff = Record<string, never>;

/**
 * Result payload for document diffing.
 */
export interface DiffResult {
  /** Diffs computed from the ProseMirror document structure. */
  docDiffs: NodeDiff[];
  /** Diffs computed from comment content and metadata. */
  commentDiffs: CommentDiff[];
}

/**
 * Computes structural diffs between two ProseMirror documents, emitting insert/delete/modify operations for any block
 * node (paragraphs, images, tables, etc.). Paragraph mutations include inline text and inline-node diffs so consumers
 * can reflect character-level and formatting changes as well.
 *
 * Diffs are intended to be replayed on top of the old document in reverse order: `pos` marks the cursor location
 * that should be used before applying the diff at that index. For example, consecutive additions that sit between the
 * same pair of old nodes will share the same `pos`, so applying them from the end of the list guarantees they appear
 * in the correct order in the reconstructed document.
 *
 * @param oldPmDoc The previous ProseMirror document.
 * @param newPmDoc The updated ProseMirror document.
 * @param schema The schema used to interpret document nodes (unused for now).
 * @returns Object containing document and comment diffs.
 */
export function computeDiff(oldPmDoc: PMNode, newPmDoc: PMNode, schema: Schema): DiffResult {
  void schema;
  return {
    docDiffs: diffNodes(oldPmDoc, newPmDoc),
    commentDiffs: [],
  };
}
