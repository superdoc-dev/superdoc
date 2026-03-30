import { getMarksFromSelection } from '../helpers/getMarksFromSelection.js';

/**
 * Retrieve the mark set for the current selection without duplicates.
 * @returns {import('./types/index.js').Command}
 */
export const getSelectionMarks =
  () =>
  ({ state, tr }) => {
    tr.setMeta('preventDispatch', true);

    const marks = getMarksFromSelection(state) ?? [];
    const uniqueByType = new Map();

    for (const mark of marks) {
      const typeName = typeof mark?.type === 'string' ? mark.type : mark?.type?.name;
      if (!typeName) continue;

      const existing = uniqueByType.get(typeName);
      if (!existing) {
        uniqueByType.set(typeName, mark);
        continue;
      }

      const existingAttrs = existing?.attrs ?? {};
      const nextAttrs = mark?.attrs ?? {};
      const existingHasValues = Object.values(existingAttrs).some((value) => value != null);
      const nextHasValues = Object.values(nextAttrs).some((value) => value != null);

      if (!existingHasValues && nextHasValues) {
        uniqueByType.set(typeName, mark);
      }
    }

    return Array.from(uniqueByType.values());
  };
