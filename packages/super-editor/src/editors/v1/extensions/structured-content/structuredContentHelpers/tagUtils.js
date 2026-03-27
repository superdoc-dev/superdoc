/**
 * Utilities for handling structured content tags with JSON encoding.
 * Supports extensible tag objects while maintaining backward compatibility with plain strings.
 */

/**
 * Creates a JSON-encoded tag object.
 * @param {Object} tagData - Tag properties
 * @param {string} [tagData.group] - Group identifier for linking multiple fields
 * @param {...*} [tagData.rest] - Additional extensible properties
 * @returns {string} JSON-encoded tag string
 * @example
 * createTagObject({ group: 'customer-info' })
 * // => '{"group":"customer-info"}'
 *
 * createTagObject({ group: 'terms', style: 'header' })
 * // => '{"group":"terms","style":"header"}'
 */
export function createTagObject(tagData) {
  if (!tagData || typeof tagData !== 'object') {
    return null;
  }
  return JSON.stringify(tagData);
}

/**
 * Parses a tag value into an object.
 * Returns null for plain string tags or invalid JSON.
 * @param {string} tag - Tag value to parse
 * @returns {Object|null} Parsed tag object or null
 * @example
 * parseTagObject('{"group":"customer-info"}')
 * // => { group: 'customer-info' }
 *
 * parseTagObject('inline_text_sdt')
 * // => null (plain string tag)
 */
export function parseTagObject(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(tag);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Checks if a tag has a group property.
 * @param {string} tag - Tag value to check
 * @returns {boolean} True if tag has a group property
 * @example
 * hasGroup('{"group":"customer-info"}')  // => true
 * hasGroup('inline_text_sdt')            // => false
 */
export function hasGroup(tag) {
  const parsed = parseTagObject(tag);
  return parsed !== null && typeof parsed.group === 'string';
}

/**
 * Extracts the group value from a tag.
 * @param {string} tag - Tag value
 * @returns {string|null} Group value or null if not found
 * @example
 * getGroup('{"group":"customer-info"}')  // => 'customer-info'
 * getGroup('inline_text_sdt')            // => null
 */
export function getGroup(tag) {
  const parsed = parseTagObject(tag);
  return parsed && typeof parsed.group === 'string' ? parsed.group : null;
}
