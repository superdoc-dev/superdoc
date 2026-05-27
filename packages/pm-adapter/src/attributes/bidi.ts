/**
 * Bidirectional Text (BiDi) Utilities
 *
 * Functions for handling RTL text and indent mirroring.
 */

import type { ParagraphIndent } from '@superdoc/contracts';

/**
 * Mirror paragraph indent for RTL text.
 * Swaps left/right indents and inverts firstLine/hanging.
 */
export const mirrorIndentForRtl = (indent: ParagraphIndent): ParagraphIndent => {
  const mirrored: ParagraphIndent = {};
  let mutated = false;

  if (indent.right != null) {
    mirrored.left = indent.right;
    mutated = true;
  }
  if (indent.left != null) {
    mirrored.right = indent.left;
    mutated = true;
  }
  if (indent.firstLine != null) {
    mirrored.firstLine = -indent.firstLine;
    mutated = true;
  }
  if (indent.hanging != null) {
    mirrored.hanging = -indent.hanging;
    mutated = true;
  }

  return mutated ? mirrored : indent;
};
