// @ts-check
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';
import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { updateNumberingProperties } from './changeListLevel.js';
import { getFormatConfig } from '@helpers/numbering-format-config.js';

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
