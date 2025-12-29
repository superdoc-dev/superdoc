import type { Node as PMNode } from 'prosemirror-model';
import { diffNodes, type NodeDiff } from './algorithm/generic-diffing.ts';

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
 * @returns List of diff objects describing added, deleted or modified nodes (with inline-level diffs for paragraphs).
 */
export function computeDiff(oldPmDoc: PMNode, newPmDoc: PMNode): NodeDiff[] {
  return diffNodes(oldPmDoc, newPmDoc);
}
