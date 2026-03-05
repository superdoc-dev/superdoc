/**
 * OOXML unsignedInt bounds for wp:anchor@relativeHeight.
 * ECMA-376 defines unsignedInt as 0..4294967295.
 */
export const Z_ORDER_RELATIVE_HEIGHT_MIN = 0;
export const Z_ORDER_RELATIVE_HEIGHT_MAX = 4_294_967_295;

/**
 * Returns true when the value is an unsigned 32-bit integer.
 */
export function isUnsignedInt32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= Z_ORDER_RELATIVE_HEIGHT_MIN &&
    value <= Z_ORDER_RELATIVE_HEIGHT_MAX
  );
}
