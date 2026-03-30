// @ts-check
/**
 * Cell border configuration
 * @typedef {Object} CellBorder
 * @property {number} [size=1] - Border width in pixels
 * @property {string} [color='#000000'] - Border color
 * @property {string} [style='solid'] - Border style
 */

/**
 * Cell borders object
 * @typedef {Object} CellBorders
 * @property {CellBorder} [top] - Top border
 * @property {CellBorder} [right] - Right border
 * @property {CellBorder} [bottom] - Bottom border
 * @property {CellBorder} [left] - Left border
 */

/**
 * Create cell border configuration object
 * @private
 * @category Helper
 * @param {Object} [options] - Border options
 * @param {number} [options.size=0.66665] - Border width in pixels
 * @param {string} [options.color='#000000'] - Border color (hex)
 * @returns {CellBorders} Complete borders object for all cell sides
 */
export const createCellBorders = (borderSpec = {}) => {
  borderSpec = {
    size: 0.66665,
    color: '#000000',
    ...borderSpec,
  };

  return {
    top: borderSpec,
    left: borderSpec,
    bottom: borderSpec,
    right: borderSpec,
  };
};
