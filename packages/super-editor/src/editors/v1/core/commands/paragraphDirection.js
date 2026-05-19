import { resolveHypotheticalParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Set paragraph direction (LTR/RTL) on every paragraph in the current selection.
 * @category Command
 * @param {Object} input
 * @param {"ltr"|"rtl"} input.direction
 * @param {"matchDirection"} [input.alignmentPolicy] - When set to "matchDirection",
 *   mirror an *explicit* `justification` of "left" ↔ "right" so the alignment
 *   follows the new direction. Leaves "center", "both", and unset values alone.
 * @returns {Function} ProseMirror command function
 * @example
 * editor.commands.setParagraphDirection({ direction: 'rtl', alignmentPolicy: 'matchDirection' })
 */
export const setParagraphDirection = ({ direction, alignmentPolicy } = {}) => {
  // Guard against headless callers that invoke this through a generic
  // "execute by command name" pathway without a payload — a missing
  // direction must be a no-op, not a silent LTR write.
  if (direction !== 'ltr' && direction !== 'rtl') return () => false;
  return walkParagraphs((pPr, { editor, $pos }) => {
    const next = { ...pPr };
    if (direction === 'rtl') {
      next.rightToLeft = true;
    } else {
      // AIDEV-NOTE: LTR first tries to delete the inline override (so a
      // vanilla paragraph round-trips without `<w:bidi w:val="0"/>`). But
      // if the paragraph inherits `rightToLeft: true` from its style (or
      // any other level of the OOXML cascade), deleting alone leaves the
      // resolved direction as RTL — clicking LTR would be a silent no-op.
      // Re-resolve the cascade against the would-be inline state; if RTL
      // still wins, force an explicit `false` to override the style.
      delete next.rightToLeft;
      const resolved = resolveHypotheticalParagraphProperties(editor, $pos, next);
      if (resolved?.rightToLeft === true) {
        next.rightToLeft = false;
      }
    }
    if (alignmentPolicy === 'matchDirection') {
      const j = pPr.justification;
      if (j === 'left' && direction === 'rtl') next.justification = 'right';
      else if (j === 'right' && direction === 'ltr') next.justification = 'left';
    }
    return next;
  });
};

/**
 * Clear an explicit paragraph direction override on every paragraph in the
 * current selection. The paragraph reverts to its auto-resolved direction.
 * @category Command
 * @returns {Function} ProseMirror command function
 * @example
 * editor.commands.clearParagraphDirection()
 */
export const clearParagraphDirection = () =>
  walkParagraphs((pPr) => {
    const next = { ...pPr };
    delete next.rightToLeft;
    return next;
  });

function walkParagraphs(transform) {
  return ({ editor, state, dispatch }) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let touched = false;

    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;

      const existing = node.attrs.paragraphProperties || {};
      const updated = transform(existing, { editor, node, $pos: state.doc.resolve(pos) });

      if (shallowEqual(existing, updated)) return false;

      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        paragraphProperties: updated,
      });
      touched = true;
      return false;
    });

    if (touched && dispatch) dispatch(tr);
    return touched;
  };
}

function shallowEqual(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
