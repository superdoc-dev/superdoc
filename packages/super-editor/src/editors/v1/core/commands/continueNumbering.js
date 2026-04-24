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

  // removeLvlOverride synchronously triggers handleNumberingInvalidation, which
  // dispatches a fresh tr that runs through appendTransaction and updates the doc.
  // The `tr` captured by CommandService before this command ran is now stale, so
  // flag it with preventDispatch. `dispatch` receives a fresh tr from the updated
  // state so direct callers still see the update.
  tr.setMeta('preventDispatch', true);
  if (dispatch) dispatch(editor.state.tr);
  return true;
};
