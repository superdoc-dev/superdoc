// @ts-check
import { updateNumberingProperties } from './changeListLevel.js';
import { ListHelpers, markerTextToBulletStyle, numberingInfoToOrderedStyle } from '@helpers/list-numbering-helpers.js';
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

/**
 * @param {any} node
 * @param {any} editor
 * @param {string} listType
 * @param {'disc'|'circle'|'square'|null} [bulletStyle]
 * @param {import('../../extensions/types/paragraph-commands.js').OrderedListStyle|null} [orderedStyle]
 */
function paragraphMatchesToggleListType(node, editor, listType, bulletStyle, orderedStyle) {
  const kind = getParagraphListKind(node, editor);
  if (!kind) return false;
  if (listType === 'bulletList') {
    if (kind !== 'bullet') return false;
    if (!bulletStyle) return true;
    const markerText = node.attrs.listRendering?.markerText;
    return markerTextToBulletStyle(markerText) === bulletStyle;
  }
  if (listType === 'orderedList') {
    if (kind !== 'ordered') return false;
    if (!orderedStyle) return true;
    const { numberingType, markerText } = node.attrs.listRendering ?? {};
    return numberingInfoToOrderedStyle(numberingType, markerText) === orderedStyle;
  }
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

/**
 * @param {string} listType
 * @param {'disc'|'circle'|'square'|null} [bulletStyle]
 * @param {import('../../extensions/types/paragraph-commands.js').OrderedListStyle|null} [orderedStyle]
 */
export const toggleList =
  (listType, bulletStyle, orderedStyle) =>
  ({ editor, state, tr, dispatch }) => {
    if (listType !== 'orderedList' && listType !== 'bulletList') {
      return false;
    }

    const predicate = (n) => paragraphMatchesToggleListType(n, editor, listType, bulletStyle, orderedStyle);
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

    // Skip visually empty paragraphs when creating a list from multiple paragraphs;
    // a single selected paragraph (even if empty) should still toggle.
    const originalParagraphsInSelection =
      allParagraphsInSelection.length === 1
        ? allParagraphsInSelection
        : allParagraphsInSelection.filter(({ node }) => !isVisuallyEmptyParagraph(node));

    // Expand to every sibling paragraph at the same `(numId, ilvl)` when the selection is
    // entirely inside a list, so a caret in one item flips every item at that level.
    let paragraphsInSelection = originalParagraphsInSelection;
    const seenLevels = new Set();
    let allListItems = paragraphsInSelection.length > 0;
    for (const { node } of paragraphsInSelection) {
      const np = getResolvedParagraphProperties(node)?.numberingProperties;
      if (!np?.numId) {
        allListItems = false;
        break;
      }
      seenLevels.add(`${Number(np.numId)}:${Number(np.ilvl ?? 0)}`);
    }

    // Bare-caret toggles target the whole list level (every sibling at the same
    // (numId, ilvl) is restyled together). A non-empty selection narrows the scope
    // to exactly the paragraphs the user picked.
    if (allListItems && seenLevels.size > 0 && selection.empty) {
      const expanded = new Map(paragraphsInSelection.map((p) => [p.pos, p]));
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'paragraph') return true;
        if (expanded.has(pos)) return false;
        const np = getResolvedParagraphProperties(node)?.numberingProperties;
        if (np?.numId && seenLevels.has(`${Number(np.numId)}:${Number(np.ilvl ?? 0)}`)) {
          expanded.set(pos, { node, pos });
        }
        return false;
      });
      paragraphsInSelection = [...expanded.values()].sort((a, b) => a.pos - b.pos);
    }

    for (const { node } of paragraphsInSelection) {
      if (!firstListNode && predicate(node)) {
        firstListNode = node;
      } else if (!predicate(node)) {
        hasNonListParagraphs = true;
      }
    }
    // Only borrow numbering from a preceding list paragraph when the selection is made up
    // entirely of plain paragraphs. If any selected paragraph already has numbering, fall
    // through to `create` so we mint a fresh abstract and don't clobber existing nesting.
    const selectionAlreadyHasListNumbering = paragraphsInSelection.some(
      ({ node }) => getResolvedParagraphProperties(node)?.numberingProperties != null,
    );
    if (!firstListNode && !selectionAlreadyHasListNumbering && from > 0) {
      const beforeNode = getPrecedingParagraphForListReuse(state.doc, from, paragraphsInSelection);
      if (beforeNode && predicate(beforeNode)) {
        firstListNode = beforeNode;
      }
    }

    // Whole-list restyle: with a bare caret on a list paragraph (and none already in the
    // requested kind+style), clone the abstract per unique (numId, ilvl) and migrate every
    // sibling at that level to the new numId via PM-tracked `setNodeMarkup`. The original
    // abstract is never mutated, so PM history undo can revert the migration → siblings
    // return to the source numId → markers go back to the original style.
    //   - Style swap within the same kind (disc → square, decimal → upper-roman).
    //   - Kind switch (bullet → ordered) — the new abstract carries the new kind at the
    //     paragraph's existing ilvl, so the parent level (e.g. level 0 bullet) is preserved.
    if (firstListNode == null && allListItems && selection.empty) {
      // Default each kind to its canonical style when the caller didn't specify one,
      // so plain `toggleOrderedList()` / `toggleBulletList()` still flips the level.
      const effectiveBulletStyle = listType === 'bulletList' ? (bulletStyle ?? 'disc') : null;
      const effectiveOrderedStyle = listType === 'orderedList' ? (orderedStyle ?? 'decimal') : null;

      // Group paragraphs by (sourceNumId, ilvl) so each unique level mints exactly one clone.
      const groups = new Map();
      for (const p of paragraphsInSelection) {
        const np = getResolvedParagraphProperties(p.node).numberingProperties;
        const sourceNumId = Number(np.numId);
        const ilvl = Number(np.ilvl ?? 0);
        const key = `${sourceNumId}:${ilvl}`;
        if (!groups.has(key)) groups.set(key, { sourceNumId, ilvl, paragraphs: [] });
        groups.get(key).paragraphs.push(p);
      }

      if (groups.size > 0) {
        if (!dispatch) return true;

        for (const { sourceNumId, ilvl, paragraphs } of groups.values()) {
          const minted = ListHelpers.cloneListDefinitionWithLevelStyle({
            editor,
            sourceNumId,
            ilvl,
            bulletStyle: effectiveBulletStyle,
            orderedStyle: effectiveOrderedStyle,
          });
          if (!minted) continue;
          for (const { node, pos } of paragraphs) {
            updateNumberingProperties({ numId: minted.newNumId, ilvl }, node, pos, editor, tr);
          }
        }

        // The numbering model has already been mutated via mutateNumbering
        // inside cloneListDefinitionWithLevelStyle. The setNodeMarkup steps
        // added to `tr` above need to be dispatched too — otherwise direct
        // command callers (e.g. `editor.commands.toggleOrderedListStyle(...)`
        // invoked outside the toolbar wiring) would see the numbering
        // definitions change without the paragraphs migrating to them.
        dispatch(tr);
        return true;
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
      // If we're swapping the bullet/ordered style on an already-nested item, mint the
      // new list with the override applied at that paragraph's existing level —
      // otherwise the override only lands on level 0 and the nested paragraph
      // ends up rendering whatever marker the base template assigned to its
      // level. We pick the level from the first list paragraph in the
      // selection so style swaps stay coherent with the existing nesting.
      let styleOverrideLevel = 0;
      if (bulletStyle || orderedStyle) {
        const firstExistingListPara = paragraphsInSelection.find(
          ({ node }) => getResolvedParagraphProperties(node)?.numberingProperties?.ilvl != null,
        );
        const existingIlvl = firstExistingListPara
          ? getResolvedParagraphProperties(firstExistingListPara.node)?.numberingProperties?.ilvl
          : null;
        if (existingIlvl != null) styleOverrideLevel = existingIlvl;
      }

      const numId = ListHelpers.getNewListId(editor);
      ListHelpers.generateNewListDefinition({
        numId: Number(numId),
        listType,
        editor,
        bulletStyle,
        bulletStyleLevel: styleOverrideLevel,
        orderedStyle,
        orderedStyleLevel: styleOverrideLevel,
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

    // Restore selection anchored to the user's original range, not the expanded one.
    if (originalParagraphsInSelection.length > 0) {
      const firstPara = originalParagraphsInSelection[0];
      const lastPara = originalParagraphsInSelection[originalParagraphsInSelection.length - 1];
      // `toggleList()` only updates paragraph attributes via `setNodeMarkup()`,
      // so the paragraph boundaries stay stable inside the transaction.
      const firstParagraphPos = firstPara.pos;
      const lastParagraphPos = lastPara.pos;
      const firstNode = tr.doc.nodeAt(firstParagraphPos);
      const lastNode = tr.doc.nodeAt(lastParagraphPos);
      const restoredSelectionRange = computeToggleListSelectionRange({
        selectionWasCollapsed: selection.empty,
        affectedParagraphCount: originalParagraphsInSelection.length,
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
          if (selection.empty && originalParagraphsInSelection.length === 1) {
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
