import { ListHelpers } from '@helpers/list-numbering-helpers.js';
import { updateNumberingProperties } from './changeListLevel.js';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

/**
 * Set the list kind for a paragraph-based list item at a specific position.
 *
 * Uses deterministic semantics:
 * - `kind: "ordered"` -> default ordered numbering definition
 * - `kind: "bullet"` -> default bullet numbering definition
 *
 * @param {{ pos: number; kind: 'ordered' | 'bullet' }} options
 * @returns {import('./types/index.js').Command}
 */
export const setListTypeAt =
  ({ pos, kind }) =>
  ({ state, tr, editor, dispatch }) => {
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;
    if (kind !== 'ordered' && kind !== 'bullet') return false;

    const paragraph = state.doc.nodeAt(pos);
    if (!paragraph || paragraph.type.name !== 'paragraph') return false;

    const resolvedProps = getResolvedParagraphProperties(paragraph);
    const numberingProperties =
      resolvedProps?.numberingProperties ?? paragraph.attrs?.paragraphProperties?.numberingProperties;
    if (!numberingProperties) return false;

    const level = Number(numberingProperties.ilvl ?? 0) || 0;
    const listType = kind === 'bullet' ? 'bulletList' : 'orderedList';

    if (!dispatch) return true;

    const newNumId = Number(ListHelpers.getNewListId(editor));
    if (!Number.isFinite(newNumId)) return false;

    ListHelpers.generateNewListDefinition({
      numId: newNumId,
      listType,
      editor,
    });

    updateNumberingProperties(
      {
        ...numberingProperties,
        numId: newNumId,
        ilvl: level,
      },
      paragraph,
      pos,
      editor,
      tr,
    );

    dispatch(tr);
    return true;
  };
