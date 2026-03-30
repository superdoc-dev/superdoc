// @ts-check

/**
 * Create table border configuration object
 * @private
 * @category Helper
 * @param {import("../table.js").TableBorderSpec} [borderSpec] - Border options
 * @returns {import("../table.js").TableBorders} Complete borders object for all sides
 * @example
 * // Using default values
 * const borders = createTableBorders()
 *
 * // Using custom values
 * const borders = createTableBorders({ size: 1, color: '#cccccc' })
 * @note Creates uniform borders for all sides including inside borders
 */
export const createTableBorders = (borderSpec = {}) => {
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
    insideH: borderSpec,
    insideV: borderSpec,
  };
};
