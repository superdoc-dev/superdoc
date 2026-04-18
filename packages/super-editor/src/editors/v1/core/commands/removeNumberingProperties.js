// @ts-check
import { findParentNode } from '../helpers/findParentNode.js';
import { isList } from '@core/commands/list-helpers';
import { decreaseListIndent } from './decreaseListIndent.js';
import { updateNumberingProperties } from './changeListLevel.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

export const removeNumberingProperties =
  ({ checkType = 'startParagraph' } = {}) =>
  (props) => {
    const { tr, state, editor, dispatch } = props;
    const { node: paragraph, pos } = findParentNode(isList)(state.selection) || {};

    // Guard checks
    if (!paragraph) return false;
    if (checkType === 'empty' && !isVisuallyEmptyParagraph(paragraph)) return false;
    if (checkType === 'startParagraph') {
      const { $from, empty } = state.selection;
      if ((!empty || $from.parentOffset !== 0) && !isVisuallyEmptyParagraph(paragraph)) return false;
    }

    // If level > 0, outdent one level first
    const ilvl = getResolvedParagraphProperties(paragraph).numberingProperties.ilvl;
    if (ilvl > 0) {
      const outdented = decreaseListIndent()(props);
      if (outdented) {
        tr.scrollIntoView();
      }
      return outdented;
    } else {
      // Level 0: exit list
      updateNumberingProperties(null, paragraph, pos, editor, tr);
    }
    if (dispatch) dispatch(tr);
    return true;
  };

/**
 * Check if a paragraph node is visually empty.
 * A paragraph is considered visually empty if it has no text content
 * (ignoring empty <run> wrappers) and no hardBreak.
 * @param {import('prosemirror-model').Node} node
 * @returns {boolean}
 */
function isVisuallyEmptyParagraph(node) {
  if (!node || node.type.name !== 'paragraph') return false;

  // hardBreak => not empty
  let hasHardBreak = false;
  node.descendants((n) => {
    if (n.type && n.type.name === 'hardBreak') {
      hasHardBreak = true;
      return false; // stop
    }
    return true;
  });
  if (hasHardBreak) return false;

  // Any visible text?
  const text = (node.textContent || '').replace(/\u200b/g, '').trim();
  if (text.length > 0) return false;

  // Any inline leaf content (e.g., image, emoji, inline atom)?
  // We ignore wrappers (non-leaf inline nodes) that may be empty.
  let hasInlineLeaf = false;
  node.descendants((n) => {
    if (n.isInline && n.isLeaf && n.type?.name !== 'hardBreak' && n.type?.name !== 'run') {
      hasInlineLeaf = true;
      return false; // stop
    }
    return true;
  });
  if (hasInlineLeaf) return false;

  // No text, no inline leafs, no hard breaks => visually empty
  return true;
}

export { isVisuallyEmptyParagraph };
