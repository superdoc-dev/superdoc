// @ts-check
/**
 * Check if cursor is inside a table
 * @private
 * @category Helper
 * @param {Object} state - Editor state
 * @returns {boolean} True if cursor is in table
 * @example
 * if (isInTable(state)) {
 *   // Enable table-specific commands
 * }
 */
export const isInTable = (state) => {
  const { $head } = state.selection;

  for (let d = $head.depth; d > 0; d -= 1) {
    if ($head.node(d).type?.spec?.tableRole === 'row') {
      return true;
    }
  }

  return false;
};
