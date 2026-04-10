import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection, type Transaction } from 'prosemirror-state';

function needsEditableSlot(node: PMNode | null | undefined, side: 'before' | 'after'): boolean {
  if (!node) return true;
  const name = node.type.name;
  if (name === 'hardBreak' || name === 'lineBreak' || name === 'structuredContent') return true;
  if (name === 'run') return !(side === 'before' ? node.lastChild?.isText : node.firstChild?.isText);
  return false;
}

/**
 * Ensures a collapsed caret can live at an inline structuredContent boundary by
 * inserting ZWSP when the adjacent slice has no text (keyboard + presentation clicks).
 */
export function applyEditableSlotAtInlineBoundary(
  tr: Transaction,
  pos: number,
  direction: 'before' | 'after',
): Transaction {
  const clampedPos = Math.max(0, Math.min(pos, tr.doc.content.size));
  if (direction === 'before') {
    const $pos = tr.doc.resolve(clampedPos);
    if (!needsEditableSlot($pos.nodeBefore, 'before')) {
      return tr.setSelection(TextSelection.create(tr.doc, clampedPos));
    }
    tr.insertText('\u200B', clampedPos);
    return tr.setSelection(TextSelection.create(tr.doc, clampedPos + 1));
  }
  if (!needsEditableSlot(tr.doc.nodeAt(clampedPos), 'after')) {
    return tr.setSelection(TextSelection.create(tr.doc, clampedPos));
  }
  tr.insertText('\u200B', clampedPos);
  return tr.setSelection(TextSelection.create(tr.doc, clampedPos + 1));
}
