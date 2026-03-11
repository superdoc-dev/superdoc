// @ts-check
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { updateNumberingProperties } from './changeListLevel.js';
import { getFormatConfig } from '@helpers/numbering-format-config.js';

/**
 * Check if a paragraph node is an ordered list item
 * @param {import('prosemirror-model').Node} node
 * @param {object} paraProps - Resolved paragraph properties
 * @returns {boolean}
 */
function isOrderedListParagraph(node, paraProps) {
  return !!(
    paraProps.numberingProperties &&
    node.attrs.listRendering &&
    node.attrs.listRendering.numberingType !== 'bullet'
  );
}

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

  const matchesTarget = (node) => {
    if (node.type.name !== 'paragraph') return false;
    const paraProps = getResolvedParagraphProperties(node);
    if (!isOrderedListParagraph(node, paraProps)) return false;
    const numId = paraProps.numberingProperties?.numId;
    const ilvl = paraProps.numberingProperties?.ilvl ?? 0;
    return numId === targetNumId && ilvl === targetIlvl;
  };

  const allParagraphs = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      allParagraphs.push({ node, pos, paraProps: getResolvedParagraphProperties(node) });
    }
  });

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

  matchingParagraphs.push(allParagraphs[startIndex]);

  for (let i = startIndex - 1; i >= 0; i--) {
    if (matchesTarget(allParagraphs[i].node)) {
      matchingParagraphs.unshift(allParagraphs[i]);
    } else {
      break;
    }
  }

  for (let i = startIndex + 1; i < allParagraphs.length; i++) {
    if (matchesTarget(allParagraphs[i].node)) {
      matchingParagraphs.push(allParagraphs[i]);
    } else {
      break;
    }
  }

  return matchingParagraphs;
}

/**
 * Apply a numbering format change to a group of paragraphs sharing the same numId
 * @param {Array<{node: any, pos: number, paraProps: any}>} paragraphs
 * @param {object} formatConfig - { fmt, lvlText }
 * @param {object} editor
 * @param {object} tr - ProseMirror transaction
 */
function applyFormatToGroup(paragraphs, formatConfig, editor, tr) {
  const firstItem = paragraphs[0];
  const existingNumId = firstItem.paraProps.numberingProperties?.numId;

  const newNumId = ListHelpers.getNewListId(editor);

  // Collect distinct ilvls and apply the format to each level
  const seenIlvls = new Set();
  for (const { paraProps } of paragraphs) {
    seenIlvls.add(paraProps.numberingProperties?.ilvl ?? 0);
  }

  for (const ilvl of seenIlvls) {
    // Preserve existing start value from the original definition
    const details = ListHelpers.getListDefinitionDetails({ numId: existingNumId, level: ilvl, editor });
    const existingStart = details?.start ?? '1';

    ListHelpers.generateNewListDefinition({
      numId: Number(newNumId),
      listType: 'orderedList',
      level: String(ilvl),
      start: existingStart,
      text: formatConfig.lvlText,
      fmt: formatConfig.fmt,
      editor,
    });
  }

  for (const { node, pos, paraProps } of paragraphs) {
    const currentIlvl = paraProps.numberingProperties?.ilvl ?? 0;
    updateNumberingProperties({ numId: Number(newNumId), ilvl: currentIlvl }, node, pos, editor, tr);
  }
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

    let paragraphsInSelection = [];
    const isCollapsed = from === to;

    if (isCollapsed) {
      let cursorPos = null;

      state.doc.nodesBetween(from - 1, from + 1, (node, pos) => {
        if (node.type.name === 'paragraph' && pos <= from && from <= pos + node.nodeSize) {
          const paraProps = getResolvedParagraphProperties(node);
          if (isOrderedListParagraph(node, paraProps)) {
            cursorPos = pos;
          }
          return false;
        }
        return true;
      });

      if (cursorPos != null) {
        const $pos = state.doc.resolve(cursorPos);
        const node = $pos.nodeAfter;
        const paraProps = getResolvedParagraphProperties(node);
        const targetNumId = paraProps.numberingProperties?.numId;
        const targetIlvl = paraProps.numberingProperties?.ilvl ?? 0;
        paragraphsInSelection = findAdjacentListItems(state.doc, cursorPos, targetNumId, targetIlvl);
      }
    } else {
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph') {
          const paraProps = getResolvedParagraphProperties(node);
          if (isOrderedListParagraph(node, paraProps)) {
            paragraphsInSelection.push({ node, pos, paraProps });
          }
          return false;
        }
        return true;
      });
    }

    if (paragraphsInSelection.length === 0) {
      return false;
    }

    const formatConfig = getFormatConfig(numberingFormat);
    if (!formatConfig) {
      return false;
    }

    // Group paragraphs by numId so separate lists stay separate
    const groups = new Map();
    for (const item of paragraphsInSelection) {
      const numId = item.paraProps.numberingProperties?.numId;
      if (!numId) continue;
      if (!groups.has(numId)) groups.set(numId, []);
      groups.get(numId).push(item);
    }

    if (groups.size === 0) {
      return false;
    }

    for (const group of groups.values()) {
      applyFormatToGroup(group, formatConfig, editor, tr);
    }

    if (dispatch) dispatch(tr);
    return true;
  };
