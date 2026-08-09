/**
 * Floor a number to a fixed number of decimal places.
 *
 * @param {number} val Value to floor
 * @param {number} [precision] Decimal places to keep; defaults to whole numbers
 * @returns {number} The floored value
 */
export const floor = (val, precision) => {
  const multiplier = 10 ** (precision || 0);
  return Math.floor(val * multiplier) / multiplier;
};
