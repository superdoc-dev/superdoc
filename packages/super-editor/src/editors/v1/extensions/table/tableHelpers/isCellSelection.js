// @ts-check
import { CellSelection } from 'prosemirror-tables';

/**
 * Check if selection is a cell selection
 * @private
 * @category Helper
 * @param {*} value - Selection to check
 * @returns {boolean} True if cell selection
 * @example
 * if (isCellSelection(editor.state.selection)) {
 *   // Handle cell selection
 * }
 */
export const isCellSelection = (value) => value instanceof CellSelection;
