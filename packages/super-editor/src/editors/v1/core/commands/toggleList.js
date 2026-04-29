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

    // Skip visually empty paragraphs (e.g., paragraphs with only an empty run)
    // but only when creating a list from multiple paragraphs.
    // If only a single paragraph is selected (even if empty), we should still apply the list.
    const originalParagraphsInSelection =
      allParagraphsInSelection.length === 1
        ? allParagraphsInSelection
        : allParagraphsInSelection.filter(({ node }) => !isVisuallyEmptyParagraph(node));

    // Expand to every sibling paragraph at the same (numId, ilvl) when the selection is
    // entirely inside a list. This is what makes "change list style" or "switch list type"
    // affect the whole list level — caret in one item flips every item at that level.
    let paragraphsInSelection = originalParagraphsInSelection;
    if (originalParagraphsInSelection.length > 0) {
      const seenLevels = new Set();
      let allListItems = true;
      for (const { node } of originalParagraphsInSelection) {
        const np = getResolvedParagraphProperties(node)?.numberingProperties;
        if (!np?.numId) {
          allListItems = false;
          break;
        }
        seenLevels.add(`${Number(np.numId)}:${Number(np.ilvl ?? 0)}`);
      }

      if (allListItems && seenLevels.size > 0 && typeof state.doc.descendants === 'function') {
        const expanded = new Map();
        for (const p of originalParagraphsInSelection) expanded.set(p.pos, p);

        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'paragraph') return true;
          if (!expanded.has(pos)) {
            const np = getResolvedParagraphProperties(node)?.numberingProperties;
            if (np?.numId && seenLevels.has(`${Number(np.numId)}:${Number(np.ilvl ?? 0)}`)) {
              expanded.set(pos, { node, pos });
            }
          }
          return false;
        });

        paragraphsInSelection = [...expanded.values()].sort((a, b) => a.pos - b.pos);
      }
    }

    for (const { node } of paragraphsInSelection) {
      if (!firstListNode && predicate(node)) {
        firstListNode = node;
      } else if (!predicate(node)) {
        hasNonListParagraphs = true;
      }
    }
    if (!firstListNode && from > 0) {
      const beforeNode = getPrecedingParagraphForListReuse(state.doc, from, paragraphsInSelection);
      if (beforeNode && predicate(beforeNode)) {
        firstListNode = beforeNode;
      }
    }

    // Word-compatible behavior for "change list style on existing list items":
    // When every selected paragraph is already a list of the requested kind (bullet/ordered)
    // and a specific style is requested, mutate the abstract definition for each unique
    // (numId, ilvl). Updating the abstract restyles every item at that level without
    // allocating a new numId — items keep their list membership and continue numbering.
    const styleRequested = listType === 'bulletList' ? bulletStyle : orderedStyle;
    if (styleRequested && firstListNode == null && paragraphsInSelection.length > 0) {
      const targetKind = listType === 'bulletList' ? 'bullet' : 'ordered';
      const levelsToRestyle = [];
      let allMatchKind = true;
      for (const { node } of paragraphsInSelection) {
        if (getParagraphListKind(node, editor) !== targetKind) {
          allMatchKind = false;
          break;
        }
        const np = getResolvedParagraphProperties(node)?.numberingProperties;
        if (!np?.numId) {
          allMatchKind = false;
          break;
        }
        levelsToRestyle.push({ numId: Number(np.numId), ilvl: Number(np.ilvl ?? 0) });
      }

      if (allMatchKind && levelsToRestyle.length > 0) {
        if (!dispatch) return true;

        const seen = new Set();
        for (const { numId, ilvl } of levelsToRestyle) {
          const key = `${numId}:${ilvl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          ListHelpers.setListLevelStyle({ editor, numId, ilvl, bulletStyle, orderedStyle });
        }

        // `setListLevelStyle` runs `mutateNumbering`, which synchronously fires
        // `handleNumberingInvalidation` — that dispatches a fresh empty tr against
        // the current `editor.state`, advancing `state.doc`. The `tr` CommandService
        // captured before this command ran is now stale (its `before` no longer
        // matches `state.doc`), and dispatching it would throw "Applying a mismatched
        // transaction". The invalidation pass already triggers numberingPlugin's
        // `appendTransaction` to recompute `listRendering` for every affected paragraph,
        // so we don't need to dispatch anything ourselves — just tell CommandService
        // to skip its auto-dispatch.
        tr.setMeta('preventDispatch', true);
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
      const numId = ListHelpers.getNewListId(editor);
      ListHelpers.generateNewListDefinition({ numId: Number(numId), listType, editor, bulletStyle, orderedStyle });
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

      updateNumberingProperties(sharedNumberingProperties, node, pos, editor, tr);
    }

    // Restore a natural post-toggle selection — anchored to the user's original
    // selection, NOT the expanded set. The expansion above only widens the range of
    // paragraphs we operate on; the caret should stay where the user put it.
    // Collapsed caret toggles should keep a caret. Ranged toggles should keep a range.
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
