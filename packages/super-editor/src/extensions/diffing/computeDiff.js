import { diffNodes } from './algorithm/generic-diffing.js';

/**
 * Computes paragraph-level diffs between two ProseMirror documents, returning inserts, deletes and text modifications.
 * @param {Node} oldPmDoc - The previous ProseMirror document.
 * @param {Node} newPmDoc - The updated ProseMirror document.
 * @returns {Array<object>} List of diff objects describing added, deleted or modified paragraphs.
 */
export function computeDiff(oldPmDoc, newPmDoc) {
  return diffNodes(oldPmDoc, newPmDoc);
}
