import { findParentNode } from '@helpers/index.js';
import { isList } from '@core/commands/list-helpers';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { updateNumberingProperties } from '@core/commands/changeListLevel.js';

/**
 * Restart numbering at the current list item.
 *
 * If the cursor is on the first item of the list, sets startOverride=1 on the
 * existing numId (no split needed). If it is on a mid-list item, a new numId
 * pointing to the same abstractId is created, startOverride=1 is applied to
 * that new numId, and all paragraphs from the current position onwards that
 * share the old numId are remapped to the new numId. This produces two
 * independent numbering sequences: the items before restart are unchanged and
 * the items from the restart point count from 1.
 */
export const restartNumbering = ({ editor, tr, state, dispatch }) => {
  const parentResult = findParentNode(isList)(state.selection);
  const { node: paragraph, pos: paragraphPos } = parentResult || {};
  if (!paragraph) return false;

  const { numId, ilvl = 0 } = getResolvedParagraphProperties(paragraph).numberingProperties || {};
  if (numId == null) return false;

  // Check if any list items with the same numId appear before the current position
  let hasPrecedingItems = false;
  state.doc.nodesBetween(0, paragraphPos, (node) => {
    if (hasPrecedingItems) return false;
    const props = getResolvedParagraphProperties(node)?.numberingProperties;
    if (props?.numId === numId) {
      hasPrecedingItems = true;
      return false;
    }
    return true;
  });

  if (!hasPrecedingItems) {
    // Already the first item — pin startOverride on the existing numId.
    // setLvlOverride may change counter values (e.g. the list was "continuing"
    // from a prior list), triggering handleNumberingInvalidation which updates
    // the doc synchronously. Prevent CommandService from dispatching the now-
    // stale captured tr; dispatch a fresh one for non-CommandService callers.
    ListHelpers.setLvlOverride(editor, numId, ilvl, { startOverride: 1 });
    tr.setMeta('preventDispatch', true);
    if (dispatch) dispatch(editor.state.tr);
    return true;
  }

  // Mid-list restart: create a new numId sharing the same abstractId.
  // createNumDefinition and setLvlOverride operate on a brand-new numId that
  // no paragraph references yet, so handleNumberingInvalidation's appendTransaction
  // produces no doc change. The original tr (and state.doc) remain valid.
  const allDefs = ListHelpers.getAllListDefinitions(editor);
  const abstractId = allDefs?.[numId]?.[ilvl]?.abstractId;
  if (abstractId == null) return false;

  const { numId: newNumId } = ListHelpers.createNumDefinition(editor, Number(abstractId));
  ListHelpers.setLvlOverride(editor, newNumId, ilvl, { startOverride: 1 });

  // Remap paragraphs from this position onwards to the new numId.
  state.doc.nodesBetween(paragraphPos, state.doc.content.size, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const props = getResolvedParagraphProperties(node)?.numberingProperties;
    if (props?.numId === numId) {
      updateNumberingProperties({ numId: newNumId, ilvl: props.ilvl }, node, pos, editor, tr);
    }
    return true;
  });

  if (dispatch) dispatch(tr);
  return true;
};
