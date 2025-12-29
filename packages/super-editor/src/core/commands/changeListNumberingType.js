// @ts-check
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { updateNumberingProperties } from './changeListLevel.js';
import { getFormatConfig } from '@helpers/numbering-format-config.js';

/**
 * Find all adjacent paragraphs that share the same numbering properties (numId and ilvl)
 * @param {import('prosemirror-model').Node} doc - The document
 * @param {number} startPos - The position to start searching from
 * @param {number} targetNumId - The numId to match
 * @param {number} targetIlvl - The ilvl to match
 * @returns {Array<{node: import('prosemirror-model').Node, pos: number, paraProps: any}>}
 */
function findAdjacentListItems(doc, startPos, targetNumId, targetIlvl) {
  const matchingParagraphs = [];

  // Helper to check if a paragraph matches our criteria
  const matchesTarget = (node) => {
    if (node.type.name !== 'paragraph') return false;

    const paraProps = getResolvedParagraphProperties(node);
    const isOrderedList =
      paraProps.numberingProperties && node.attrs.listRendering && node.attrs.listRendering.numberingType !== 'bullet';

    if (!isOrderedList) return false;

    const numId = paraProps.numberingProperties?.numId;
    const ilvl = paraProps.numberingProperties?.ilvl ?? 0;

    return numId === targetNumId && ilvl === targetIlvl;
  };

  // Collect all paragraphs in order, tracking their positions
  const allParagraphs = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      allParagraphs.push({ node, pos, paraProps: getResolvedParagraphProperties(node) });
    }
  });

  // Find the index of the paragraph at startPos
  let startIndex = -1;
  for (let i = 0; i < allParagraphs.length; i++) {
    if (allParagraphs[i].pos === startPos) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1 || !matchesTarget(allParagraphs[startIndex].node)) {
    return matchingParagraphs;
  }

  // Add the starting paragraph
  matchingParagraphs.push(allParagraphs[startIndex]);

  // Search backwards for consecutive matching paragraphs
  for (let i = startIndex - 1; i >= 0; i--) {
    if (matchesTarget(allParagraphs[i].node)) {
      matchingParagraphs.unshift(allParagraphs[i]);
    } else {
      break; // Stop when we hit a non-matching paragraph
    }
  }

  // Search forwards for consecutive matching paragraphs
  for (let i = startIndex + 1; i < allParagraphs.length; i++) {
    if (matchesTarget(allParagraphs[i].node)) {
      matchingParagraphs.push(allParagraphs[i]);
    } else {
      break; // Stop when we hit a non-matching paragraph
    }
  }

  return matchingParagraphs;
}

/**
 * Change the numbering type of an ordered list
 * @param {string} numberingFormat - The format to apply (decimal, lowerRoman, upperRoman, lowerLetter, upperLetter, etc.)
 * @returns {Function} Command function
 */
export const changeListNumberingType =
  (numberingFormat) =>
  ({ editor, state, tr, dispatch }) => {
    const { selection } = state;
    const { from, to } = selection;

    // Collect all paragraphs in selection that are part of an ordered list
    let paragraphsInSelection = [];

    // Check if selection is collapsed (cursor position)
    const isCollapsed = from === to;

    if (isCollapsed) {
      // Find the paragraph at cursor position
      let cursorParagraph = null;
      let cursorPos = null;

      state.doc.nodesBetween(from - 1, from + 1, (node, pos) => {
        if (node.type.name === 'paragraph' && pos <= from && from <= pos + node.nodeSize) {
          const paraProps = getResolvedParagraphProperties(node);
          const isOrderedList =
            paraProps.numberingProperties &&
            node.attrs.listRendering &&
            node.attrs.listRendering.numberingType !== 'bullet';

          if (isOrderedList) {
            cursorParagraph = { node, pos, paraProps };
            cursorPos = pos;
          }
          return false;
        }
        return true;
      });

      if (cursorParagraph) {
        const targetNumId = cursorParagraph.paraProps.numberingProperties?.numId;
        const targetIlvl = cursorParagraph.paraProps.numberingProperties?.ilvl ?? 0;

        // Find all adjacent paragraphs with the same numbering properties
        paragraphsInSelection = findAdjacentListItems(state.doc, cursorPos, targetNumId, targetIlvl);
      }
    } else {
      // Non-collapsed selection: collect paragraphs within selection
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph') {
          const paraProps = getResolvedParagraphProperties(node);
          const isOrderedList =
            paraProps.numberingProperties &&
            node.attrs.listRendering &&
            node.attrs.listRendering.numberingType !== 'bullet';

          if (isOrderedList) {
            paragraphsInSelection.push({ node, pos, paraProps });
          }
          return false; // don't descend into paragraph content
        }
        return true;
      });
    }

    if (paragraphsInSelection.length === 0) {
      return false;
    }

    // Get the numId from the first list item to determine if we need to create a new definition
    const firstListItem = paragraphsInSelection[0];
    const existingNumId = firstListItem.paraProps.numberingProperties?.numId;
    const existingIlvl = firstListItem.paraProps.numberingProperties?.ilvl ?? 0;

    if (!existingNumId) {
      return false;
    }

    // Map numbering format to Word's numFmt and lvlText
    const formatConfig = getFormatConfig(numberingFormat);
    if (!formatConfig) {
      return false;
    }

    // Create a new list definition with the new numbering format
    const newNumId = ListHelpers.getNewListId(editor);
    ListHelpers.generateNewListDefinition({
      numId: Number(newNumId),
      listType: 'orderedList',
      level: String(existingIlvl),
      start: '1',
      text: formatConfig.lvlText,
      fmt: formatConfig.fmt,
      editor,
    });

    // Apply the new numbering properties to all selected list items
    for (const { node, pos, paraProps } of paragraphsInSelection) {
      const currentIlvl = paraProps.numberingProperties?.ilvl ?? 0;
      const newNumberingProps = {
        numId: Number(newNumId),
        ilvl: currentIlvl,
      };

      updateNumberingProperties(newNumberingProps, node, pos, editor, tr);
    }

    if (dispatch) dispatch(tr);
    return true;
  };
