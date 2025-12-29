const IGNORED_ATTRIBUTE_KEYS = new Set(['sdBlockId']);

/**
 * Represents a single attribute change capturing the previous and next values.
 */
export interface AttributeChange {
  from: unknown;
  to: unknown;
}

/**
 * Aggregated attribute diff broken down into added, deleted, and modified dotted paths.
 */
export interface AttributesDiff {
  added: Record<string, unknown>;
  deleted: Record<string, unknown>;
  modified: Record<string, AttributeChange>;
}

/**
 * Computes the attribute level diff between two arbitrary objects.
 * Produces a map of dotted paths to added, deleted and modified values.
 *
 * @param objectA Baseline attributes to compare.
 * @param objectB Updated attributes to compare.
 * @returns Structured diff or null when objects are effectively equal.
 */
export function getAttributesDiff(
  objectA: Record<string, unknown> | null | undefined = {},
  objectB: Record<string, unknown> | null | undefined = {},
): AttributesDiff | null {
  const diff: AttributesDiff = {
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
 *
 * @param objectA Baseline attributes being inspected.
 * @param objectB Updated attributes being inspected.
 * @param basePath Dotted path prefix used for nested keys.
 * @param diff Aggregated diff being mutated.
 */
function diffObjects(
  objectA: Record<string, unknown>,
  objectB: Record<string, unknown>,
  basePath: string,
  diff: AttributesDiff,
): void {
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

    if (!deepEquals(valueA, valueB)) {
      diff.modified[path] = {
        from: valueA,
        to: valueB,
      };
    }
  }
}

/**
 * Records a nested value as an addition, flattening objects into dotted paths.
 *
 * @param value Value being marked as added.
 * @param path Dotted attribute path for the value.
 * @param diff Bucket used to capture additions.
 */
function recordAddedValue(value: unknown, path: string, diff: Pick<AttributesDiff, 'added'>): void {
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
 *
 * @param value Value being marked as removed.
 * @param path Dotted attribute path for the value.
 * @param diff Bucket used to capture deletions.
 */
function recordDeletedValue(value: unknown, path: string, diff: Pick<AttributesDiff, 'deleted'>): void {
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
 *
 * @param base Existing path prefix.
 * @param key Current key being appended.
 * @returns Combined dotted path.
 */
function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

/**
 * Determines if a value is a plain object (no arrays or nulls).
 *
 * @param value Value to inspect.
 * @returns True when the value is a non-null object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks deep equality for primitives, arrays, and plain objects.
 *
 * @param a First value.
 * @param b Second value.
 * @returns True when both values are deeply equal.
 */
function deepEquals(a: unknown, b: unknown): boolean {
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
