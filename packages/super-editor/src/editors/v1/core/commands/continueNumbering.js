import { findParentNode } from '@helpers/index.js';
import { isList } from '@core/commands/list-helpers';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Remove the startOverride for the current list level so the counter continues
 * from where the previous list chain left off.
 *
 * This is the complement of `restartNumbering`: instead of setting
 * w:lvlOverride/w:startOverride, it removes the override entirely.
 */
export const continueNumbering = ({ editor, tr, state, dispatch }) => {
  const { node: paragraph } = findParentNode(isList)(state.selection) || {};
  if (!paragraph) return false;

  const { numId, ilvl = 0 } = getResolvedParagraphProperties(paragraph)?.numberingProperties || {};
  if (numId == null) return false;

  ListHelpers.removeLvlOverride(editor, numId, ilvl);

  // removeLvlOverride mutates numbering, which triggers handleNumberingInvalidation
  // synchronously. That handler dispatches an empty tr, causing appendTransaction
  // to recompute listRendering and change the doc. By the time we return, the
  // original tr (captured by CommandService before this command ran) is stale.
  // Marking it with preventDispatch stops CommandService from dispatching it.
  // For callers that pass a real dispatch (tests, direct use), we dispatch a
  // fresh tr so they still observe the update.
  if (typeof tr?.setMeta === 'function') tr.setMeta('preventDispatch', true);
  if (dispatch) dispatch(editor.state.tr);
  return true;
};
