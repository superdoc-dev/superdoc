/**
 * @typedef {Object} AttributesDiff
 * @property {Record<string, any>} added
 * @property {Record<string, any>} deleted
 * @property {Record<string, {from: any, to: any}>} modified
 */

/**
 * Computes the attribute level diff between two arbitrary objects.
 * Produces a map of dotted paths to added, deleted and modified values.
 * @param {Record<string, any>} objectA
 * @param {Record<string, any>} objectB
 * @returns {AttributesDiff|null}
 */
const IGNORED_ATTRIBUTE_KEYS = new Set(['sdBlockId']);

export function getAttributesDiff(objectA = {}, objectB = {}) {
  const diff = {
    added: {},
    deleted: {},
    modified: {},
  };

  diffObjects(objectA ?? {}, objectB ?? {}, '', diff);
  const hasChanges =
    Object.keys(diff.added).length > 0 || Object.keys(diff.deleted).length > 0 || Object.keys(diff.modified).length > 0;

  return hasChanges ? diff : null;
}

/**
 * Recursively compares two objects and fills the diff buckets.
 * @param {Record<string, any>} objectA
 * @param {Record<string, any>} objectB
 * @param {string} basePath
 * @param {AttributesDiff} diff
 */
function diffObjects(objectA, objectB, basePath, diff) {
  const keys = new Set([...Object.keys(objectA || {}), ...Object.keys(objectB || {})]);

  for (const key of keys) {
    if (IGNORED_ATTRIBUTE_KEYS.has(key)) {
      continue;
    }

    const path = joinPath(basePath, key);
    const hasA = Object.prototype.hasOwnProperty.call(objectA, key);
    const hasB = Object.prototype.hasOwnProperty.call(objectB, key);

    if (hasA && !hasB) {
      recordDeletedValue(objectA[key], path, diff);
      continue;
    }

    if (!hasA && hasB) {
      recordAddedValue(objectB[key], path, diff);
      continue;
    }

    const valueA = objectA[key];
    const valueB = objectB[key];

    if (isPlainObject(valueA) && isPlainObject(valueB)) {
      diffObjects(valueA, valueB, path, diff);
      continue;
    }

    if (Array.isArray(valueA) && Array.isArray(valueB)) {
      if (valueA.length === valueB.length && valueA.every((item, index) => deepEquals(item, valueB[index]))) {
        continue;
      }
    }

    if (valueA !== valueB) {
      diff.modified[path] = {
        from: valueA,
        to: valueB,
      };
    }
  }
}

/**
 * Records a nested value as an addition, flattening objects into dotted paths.
 * @param {any} value
 * @param {string} path
 * @param {{added: Record<string, any>}} diff
 */
function recordAddedValue(value, path, diff) {
  if (isPlainObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (IGNORED_ATTRIBUTE_KEYS.has(childKey)) {
        continue;
      }
      recordAddedValue(childValue, joinPath(path, childKey), diff);
    }
    return;
  }
  diff.added[path] = value;
}

/**
 * Records a nested value as a deletion, flattening objects into dotted paths.
 * @param {any} value
 * @param {string} path
 * @param {{deleted: Record<string, any>}} diff
 */
function recordDeletedValue(value, path, diff) {
  if (isPlainObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (IGNORED_ATTRIBUTE_KEYS.has(childKey)) {
        continue;
      }
      recordDeletedValue(childValue, joinPath(path, childKey), diff);
    }
    return;
  }
  diff.deleted[path] = value;
}

/**
 * Builds dotted attribute paths.
 * @param {string} base
 * @param {string} key
 * @returns {string}
 */
function joinPath(base, key) {
  return base ? `${base}.${key}` : key;
}

/**
 * Determines if a value is a plain object (no arrays or nulls).
 * @param {any} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks deep equality for primitives, arrays, and plain objects.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function deepEquals(a, b) {
  if (a === b) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (const key of keysA) {
      if (!deepEquals(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}
