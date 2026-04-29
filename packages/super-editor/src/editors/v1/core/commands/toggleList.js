// @ts-check
import { updateNumberingProperties } from './changeListLevel.js';
import { ListHelpers, markerTextToBulletStyle } from '@helpers/list-numbering-helpers.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { isVisuallyEmptyParagraph } from './removeNumberingProperties.js';
import { Selection, TextSelection } from 'prosemirror-state';
import { computeToggleListSelectionRange } from './toggleListSelection.js';

function numFmtIsBullet(numFmt) {
  if (numFmt == null) return false;
  const v = String(numFmt).toLowerCase();
  return v === 'bullet' || v === 'image' || v === 'none';
}

function getParagraphListKind(node, editor) {
  const paraProps = getResolvedParagraphProperties(node);
  if (!paraProps?.numberingProperties || !node.attrs.listRendering) {
    return null;
  }
  const { numId, ilvl = 0 } = paraProps.numberingProperties;
  const details = ListHelpers.getListDefinitionDetails({ numId, level: ilvl, editor });
  const fmt = details?.listNumberingType ?? node.attrs.listRendering?.numberingType;
  if (fmt == null) {
    return null;
  }
  return numFmtIsBullet(fmt) ? 'bullet' : 'ordered';
}

function paragraphMatchesToggleListType(node, editor, listType, bulletStyle) {
  const kind = getParagraphListKind(node, editor);
  if (!kind) return false;
  if (listType === 'bulletList') {
    if (kind !== 'bullet') return false;
    if (!bulletStyle) return true;
    const markerText = node.attrs.listRendering?.markerText;
    return markerTextToBulletStyle(markerText) === bulletStyle;
  }
  if (listType === 'orderedList') return kind === 'ordered';
  return false;
}

/**
 * Previous paragraph sibling of the anchor block: `doc.resolve(pos).nodeBefore` where `pos`
 * is the gap before the first selected paragraph (or before the paragraph containing `from`).
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} from
 * @param {Array<{ node: import('prosemirror-model').Node, pos: number }>} paragraphsInSelection
 * @returns {import('prosemirror-model').Node | null}
 */
function getPrecedingParagraphForListReuse(doc, from, paragraphsInSelection) {
  let pos = paragraphsInSelection.length > 0 ? paragraphsInSelection[0].pos : null;
  if (pos == null && from > 0) {
    const $from = doc.resolve(from);
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name === 'paragraph') {
        pos = $from.before(d);
        break;
      }
    }
  }
  if (pos == null) return null;
  const nb = doc.resolve(pos).nodeBefore;
  return nb?.type?.name === 'paragraph' ? nb : null;
}

export const toggleList =
  (listType, bulletStyle) =>
  ({ editor, state, tr, dispatch }) => {
    if (listType !== 'orderedList' && listType !== 'bulletList') {
      return false;
    }

    const predicate = (n) => paragraphMatchesToggleListType(n, editor, listType, bulletStyle);
    const { selection } = state;
    const { from, to } = selection;
    let firstListNode = null;
    let hasNonListParagraphs = false;
    let allParagraphsInSelection = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        allParagraphsInSelection.push({ node, pos });
        return false; // stop iterating this paragraph's children
      }
      return true;
    });

    // Skip visually empty paragraphs (e.g., paragraphs with only an empty run)
    // but only when creating a list from multiple paragraphs.
    // If only a single paragraph is selected (even if empty), we should still apply the list.
    let paragraphsInSelection =
      allParagraphsInSelection.length === 1
        ? allParagraphsInSelection
        : allParagraphsInSelection.filter(({ node }) => !isVisuallyEmptyParagraph(node));

    for (const { node } of paragraphsInSelection) {
      if (!firstListNode && predicate(node)) {
        firstListNode = node;
      } else if (!predicate(node)) {
        hasNonListParagraphs = true;
      }
    }
    // Only borrow numbering from a preceding list paragraph when the selection
    // is made up of *plain* paragraphs (no numbering yet). The borrow is meant
    // to extend a previous list onto adjacent non-list paragraphs. If a
    // paragraph in the selection is already a list item — even one whose
    // marker doesn't match the requested style — we should not reuse a
    // neighbor's numId, because that throws away the existing nesting and
    // overrides the user's style choice with the neighbor's level. Falling
    // through to `create` mints a fresh abstract instead.
    const selectionAlreadyHasListNumbering = paragraphsInSelection.some(
      ({ node }) => getResolvedParagraphProperties(node)?.numberingProperties != null,
    );
    if (!firstListNode && !selectionAlreadyHasListNumbering && from > 0) {
      const beforeNode = getPrecedingParagraphForListReuse(state.doc, from, paragraphsInSelection);
      if (beforeNode && predicate(beforeNode)) {
        firstListNode = beforeNode;
      }
    }
    // 3. Resolve numbering properties
    let mode = null;
    let sharedNumberingProperties = null;
    if (firstListNode) {
      if (!hasNonListParagraphs) {
        // All paragraphs are already lists of the same type, remove the list formatting
        mode = 'remove';
      } else {
        // Apply numbering properties to new list paragraphs while keeping existing list items untouched
        mode = 'reuse';
        const paraProps = getResolvedParagraphProperties(firstListNode);
        const baseNumbering = paraProps.numberingProperties || {};
        sharedNumberingProperties = {
          ...baseNumbering,
          ilvl: baseNumbering.ilvl ?? 0,
        };
      }
    } else {
      // If list paragraph was not found, create a new list definition and apply it to all paragraphs in selection
      mode = 'create';
    }

    if (!dispatch) return true;

    if (mode === 'create') {
      // If we're swapping the bullet style on an already-nested item, mint the
      // new list with the override applied at that paragraph's existing level —
      // otherwise the override only lands on level 0 and the nested paragraph
      // ends up rendering whatever marker the base template assigned to its
      // level. We pick the level from the first list paragraph in the
      // selection so style swaps stay coherent with the existing nesting.
      let bulletStyleLevel = 0;
      if (bulletStyle) {
        const firstExistingListPara = paragraphsInSelection.find(
          ({ node }) => getResolvedParagraphProperties(node)?.numberingProperties?.ilvl != null,
        );
        const existingIlvl = firstExistingListPara
          ? getResolvedParagraphProperties(firstExistingListPara.node)?.numberingProperties?.ilvl
          : null;
        if (existingIlvl != null) bulletStyleLevel = existingIlvl;
      }

      const numId = ListHelpers.getNewListId(editor);
      ListHelpers.generateNewListDefinition({
        numId: Number(numId),
        listType,
        editor,
        bulletStyle,
        bulletStyleLevel,
      });
      sharedNumberingProperties = {
        numId: Number(numId),
        ilvl: 0,
      };
    }

    for (const { node, pos } of paragraphsInSelection) {
      if (mode === 'remove') {
        updateNumberingProperties(null, node, pos, editor, tr);
        continue;
      }

      if (mode === 'reuse' && predicate(node)) {
        // Keep existing list items (and their level) untouched
        continue;
      }

      // Preserve the paragraph's existing nesting level when re-pointing it at
      // the new list definition. Without this, swapping the bullet style on a
      // nested item snaps it back to ilvl 0 and visually "outdents" the row.
      const existingIlvl = getResolvedParagraphProperties(node)?.numberingProperties?.ilvl;
      const propertiesForParagraph =
        mode === 'create' && existingIlvl != null && existingIlvl !== sharedNumberingProperties.ilvl
          ? { ...sharedNumberingProperties, ilvl: existingIlvl }
          : sharedNumberingProperties;

      updateNumberingProperties(propertiesForParagraph, node, pos, editor, tr);
    }

    // Restore a natural post-toggle selection.
    // Collapsed caret toggles should keep a caret. Ranged toggles should keep a range.
    if (paragraphsInSelection.length > 0) {
      const firstPara = paragraphsInSelection[0];
      const lastPara = paragraphsInSelection[paragraphsInSelection.length - 1];
      // `toggleList()` only updates paragraph attributes via `setNodeMarkup()`,
      // so the paragraph boundaries stay stable inside the transaction.
      const firstParagraphPos = firstPara.pos;
      const lastParagraphPos = lastPara.pos;
      const firstNode = tr.doc.nodeAt(firstParagraphPos);
      const lastNode = tr.doc.nodeAt(lastParagraphPos);
      const restoredSelectionRange = computeToggleListSelectionRange({
        selectionWasCollapsed: selection.empty,
        affectedParagraphCount: paragraphsInSelection.length,
        firstParagraphPos,
        lastParagraphPos,
        firstNode,
        lastNode,
      });

      if (
        restoredSelectionRange &&
        restoredSelectionRange.from >= 0 &&
        restoredSelectionRange.to <= tr.doc.content.size &&
        restoredSelectionRange.from <= restoredSelectionRange.to
      ) {
        try {
          if (selection.empty && paragraphsInSelection.length === 1) {
            tr.setSelection(Selection.near(tr.doc.resolve(restoredSelectionRange.to), -1));
          } else {
            tr.setSelection(TextSelection.create(tr.doc, restoredSelectionRange.from, restoredSelectionRange.to));
          }
        } catch {
          // If the target position is not valid, keep ProseMirror's default selection.
        }
      }
    }
    dispatch(tr);
    return true;
  };
