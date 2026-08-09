// @ts-check

/**
 * Normalize "off" values used by cascade-aware formatting marks.
 * @param {unknown} value
 * @returns {boolean}
 */
export const isOffValue = (value) => {
  if (value == null) return false;
  const normalized = String(value).toLowerCase();
  return normalized === '0' || normalized === 'false' || normalized === 'off';
};

/** @type {Record<string, (attrs?: Record<string, unknown>) => boolean>} */
export const negationChecks = {
  bold: (attrs = {}) => isOffValue(attrs.value),
  italic: (attrs = {}) => isOffValue(attrs.value),
  strike: (attrs = {}) => isOffValue(attrs.value),
  underline: (attrs = {}) => {
    const type = attrs.underlineType ?? attrs.value;
    if (type == null) return false;
    const normalized = String(type).toLowerCase();
    return normalized === 'none' || isOffValue(normalized);
  },
  color: (attrs = {}) => {
    const value = attrs.color;
    if (value == null) return true;
    return String(value).toLowerCase() === 'inherit';
  },
  highlight: (attrs = {}) => {
    const value = attrs.color;
    if (value == null) return true;
    const normalized = String(value).toLowerCase();
    return normalized === 'transparent' || normalized === 'none';
  },
};

/**
 * Determine whether a mark is currently negated (explicitly turning formatting off).
 * @param {string} name
 * @param {Record<string, unknown>} [attrs]
 * @returns {boolean}
 */
export const isNegatedMark = (name, attrs = {}) => {
  const checker = negationChecks[name];
  if (typeof checker !== 'function') return false;
  return Boolean(checker(attrs));
};

export default isNegatedMark;
