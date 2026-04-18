import { findParentNode } from '@helpers/index.js';
import { isList } from '@core/commands/list-helpers';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Restart numbering for the current list by setting a startOverride on the
 * existing w:num definition.
 *
 * This uses the OOXML-correct pattern: w:lvlOverride/w:startOverride on the
 * existing w:num. Paragraphs keep their numId — only the definition is mutated.
 * This preserves list identity, makes join possible, and produces correct OOXML
 * on export.
 *
 * Note: This command is being replaced by `lists.setValue` in SD-1272 Phase 3.
 */
export const restartNumbering = ({ editor, tr, state, dispatch }) => {
  const { node: paragraph } = findParentNode(isList)(state.selection) || {};
  if (!paragraph) return false;

  const { numId, ilvl = 0 } = getResolvedParagraphProperties(paragraph).numberingProperties || {};
  if (numId == null) return false;

  ListHelpers.setLvlOverride(editor, numId, ilvl, { startOverride: 1 });

  if (dispatch) dispatch(tr);
  return true;
};
