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
export const restartNumbering = ({ editor, tr, state }) => {
  const parentResult = findParentNode(isList)(state.selection);
  const { node: paragraph, pos: paragraphPos } = parentResult || {};
  if (!paragraph) return false;

  const { numId, ilvl = 0 } = getResolvedParagraphProperties(paragraph).numberingProperties || {};
  if (numId == null) return false;

  // Check if any list items with the same numId appear before the current position.
  // Non-paragraph nodes are skipped (not matched directly, but we still descend
  // into block containers to find paragraphs inside tables/sections).
  let hasPrecedingItems = false;
  state.doc.nodesBetween(0, paragraphPos, (node) => {
    if (hasPrecedingItems) return false;
    if (node.type.name !== 'paragraph') return true;
    const props = getResolvedParagraphProperties(node)?.numberingProperties;
    if (props?.numId === numId) hasPrecedingItems = true;
    return false;
  });

  if (!hasPrecedingItems) {
    // Already the first item — pin startOverride on the existing numId.
    // setLvlOverride triggers handleNumberingInvalidation, which dispatches a
    // fresh tr through `editor.view.dispatch` to recompute listRendering. After
    // that the captured tr points at a stale doc and dispatching it would throw
    // "Applying a mismatched transaction" — so we flag it with `preventDispatch`.
    // In headless mode (no view) handleNumberingInvalidation is a silent no-op,
    // so the captured tr stays valid and we must let CommandService dispatch it
    // (otherwise listRendering never recomputes and `update`/`transaction`
    // listeners never fire).
    ListHelpers.setLvlOverride(editor, numId, ilvl, { startOverride: 1 });
    if (editor.view) tr.setMeta('preventDispatch', true);
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

  // Remap paragraphs from this position onwards to the new numId. Steps are
  // accumulated on the captured tr; CommandService dispatches it after we return.
  // Default ilvl to 0 — when numbering comes from a style (e.g. ListNumber) the
  // inline numberingProperties may omit ilvl. Without the default we'd export
  // a <w:numPr> with no <w:ilvl>, but Word always writes <w:ilvl w:val="0"/>.
  state.doc.nodesBetween(paragraphPos, state.doc.content.size, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const props = getResolvedParagraphProperties(node)?.numberingProperties;
    if (props?.numId === numId) {
      updateNumberingProperties({ numId: newNumId, ilvl: props.ilvl ?? 0 }, node, pos, editor, tr);
    }
    return true;
  });

  return true;
};
