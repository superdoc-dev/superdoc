// @ts-check
import { updateNumberingProperties } from './changeListLevel.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { isVisuallyEmptyParagraph } from './removeNumberingProperties.js';
import { TextSelection } from 'prosemirror-state';

export const toggleList =
  (listType) =>
  ({ editor, state, tr, dispatch }) => {
    // 1. Find first paragraph in selection that is a list of the same type
    let predicate;
    if (listType === 'orderedList') {
      predicate = (n) => {
        const paraProps = getResolvedParagraphProperties(n);
        return (
          paraProps.numberingProperties && n.attrs.listRendering && n.attrs.listRendering.numberingType !== 'bullet'
        );
      };
    } else if (listType === 'bulletList') {
      predicate = (n) => {
        const paraProps = getResolvedParagraphProperties(n);
        return (
          paraProps.numberingProperties && n.attrs.listRendering && n.attrs.listRendering.numberingType === 'bullet'
        );
      };
    } else {
      return false;
    }
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
    // 2. If not found, check if the paragraph right before the selection is a list of the same type
    if (!firstListNode && from > 0) {
      const $from = state.doc.resolve(from);
      const parentIndex = $from.index(-1);
      if (parentIndex > 0) {
        const beforeNode = $from.node(-1).child(parentIndex - 1);
        if (beforeNode && beforeNode.type.name === 'paragraph' && predicate(beforeNode)) {
          firstListNode = beforeNode;
        }
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
      ListHelpers.generateNewListDefinition({ numId: Number(numId), listType, editor });
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

    // Preserve selection spanning all affected paragraphs so the user can toggle back
    if (paragraphsInSelection.length > 0) {
      const firstPara = paragraphsInSelection[0];
      const lastPara = paragraphsInSelection[paragraphsInSelection.length - 1];
      // Map positions through the transaction
      const mappedFirstPos = tr.mapping.map(firstPara.pos);
      const mappedLastPos = tr.mapping.map(lastPara.pos);
      // Get the updated nodes from the transformed document
      const $firstPos = tr.doc.resolve(mappedFirstPos);
      const $lastPos = tr.doc.resolve(mappedLastPos);
      const firstNode = $firstPos.nodeAfter;
      const lastNode = $lastPos.nodeAfter;
      if (firstNode && lastNode) {
        // Find first text position in first paragraph and last text position in last paragraph
        let selFrom = mappedFirstPos + 1;
        let selTo = mappedLastPos + lastNode.nodeSize - 1;
        // Adjust selFrom to skip into actual text content (skip run wrapper if present)
        if (firstNode.firstChild && firstNode.firstChild.type.name === 'run') {
          selFrom = mappedFirstPos + 2; // paragraph + run opening
        }
        // Adjust selTo to be at end of text content
        if (lastNode.lastChild && lastNode.lastChild.type.name === 'run') {
          selTo = mappedLastPos + lastNode.nodeSize - 2; // before run and paragraph closing
        }
        if (selFrom >= 0 && selTo <= tr.doc.content.size && selFrom <= selTo) {
          try {
            tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
          } catch {
            // Fallback: if selection fails, just leave the selection as-is
          }
        }
      }
    }
    dispatch(tr);
    return true;
  };
