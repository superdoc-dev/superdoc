const IGNORED_ATTRIBUTE_KEYS = new Set(['sdBlockId']);
const TRACK_CHANGE_MARK_NAMES = new Set(['trackInsert', 'trackDelete', 'trackFormat']);
const TRACK_CHANGE_IGNORED_ATTRIBUTE_KEYS = new Set(['id', 'sourceId']);

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
  /** Attributes added in the new payload. */
  added: Record<string, unknown>;
  /** Attributes removed from the old payload. */
  deleted: Record<string, unknown>;
  /** Attributes that changed values between old and new payloads. */
  modified: Record<string, AttributeChange>;
}

/**
 * Aggregated marks diff broken down into added, deleted, and modified marks.
 */
export interface MarksDiff {
  /** Marks added in the new payload. */
  added: { name: string; attrs: Record<string, unknown> }[];
  /** Marks removed from the old payload. */
  deleted: { name: string; attrs: Record<string, unknown> }[];
  /** Marks whose attributes changed between old and new payloads. */
  modified: { name: string; oldAttrs: Record<string, unknown>; newAttrs: Record<string, unknown> }[];
}

/**
 * Computes the attribute level diff between two arbitrary objects.
 * Produces a map of dotted paths to added, deleted and modified values.
 *
 * @param objectA Baseline attributes to compare.
 * @param objectB Updated attributes to compare.
 * @param ignoreKeys Additional attribute keys to ignore.
 * @returns Structured diff or null when objects are effectively equal.
 */
export function getAttributesDiff(
  objectA: Record<string, unknown> | null | undefined = {},
  objectB: Record<string, unknown> | null | undefined = {},
  ignoreKeys: string[] = [],
): AttributesDiff | null {
  const diff: AttributesDiff = {
    added: {},
    deleted: {},
    modified: {},
  };

  const ignored = new Set([...IGNORED_ATTRIBUTE_KEYS, ...ignoreKeys]);
  diffObjects(objectA ?? {}, objectB ?? {}, '', diff, ignored);
  const hasChanges =
    Object.keys(diff.added).length > 0 || Object.keys(diff.deleted).length > 0 || Object.keys(diff.modified).length > 0;

  return hasChanges ? diff : null;
}

/**
 * Computes the attribute level diff between two sets of ProseMirror marks.
 * Produces a map of dotted paths to added, deleted and modified values.
 *
 * @param marksA Baseline marks to compare.
 * @param marksB Updated marks to compare.
 * @returns Structured diff or null when marks are effectively equal.
 *
 */
export function getMarksDiff(
  marksA: Array<{ type: string; attrs?: Record<string, unknown> }> | null = [],
  marksB: Array<{ type: string; attrs?: Record<string, unknown> }> | null = [],
): MarksDiff | null {
  marksA = marksA || [];
  marksB = marksB || [];

  const normalizeMarkAttrs = (markName: string, attrs?: Record<string, unknown>): Record<string, unknown> => {
    if (!attrs) {
      return {};
    }

    const ignoredMarkKeys = new Set<string>();
    if (TRACK_CHANGE_MARK_NAMES.has(markName)) {
      // Track change ids are generated per import and are not semantic content changes.
      for (const key of TRACK_CHANGE_IGNORED_ATTRIBUTE_KEYS) {
        ignoredMarkKeys.add(key);
      }
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (IGNORED_ATTRIBUTE_KEYS.has(key) || ignoredMarkKeys.has(key)) {
        continue;
      }
      normalized[key] = value;
    }
    return normalized;
  };
  const marksDiff: MarksDiff = {
    added: [],
    deleted: [],
    modified: [],
  };
  const entriesA = marksA.map((mark) => ({
    name: mark.type,
    raw: mark.attrs || {},
    normalized: normalizeMarkAttrs(mark.type, mark.attrs),
  }));
  const entriesB = marksB.map((mark) => ({
    name: mark.type,
    raw: mark.attrs || {},
    normalized: normalizeMarkAttrs(mark.type, mark.attrs),
  }));

  const matchedBIndices = new Set<number>();
  const exactMatchedA = new Set<number>();

  // First pass: pair exact normalized matches, preserving duplicate instances.
  entriesA.forEach((entryA, indexA) => {
    const indexB = entriesB.findIndex(
      (entryB, candidateIndexB) =>
        !matchedBIndices.has(candidateIndexB) &&
        entryA.name === entryB.name &&
        deepEquals(entryA.normalized, entryB.normalized),
    );
    if (indexB >= 0) {
      exactMatchedA.add(indexA);
      matchedBIndices.add(indexB);
    }
  });

  // Second pass: for remaining marks in A, pair by type (modification) when possible.
  entriesA.forEach((entryA, indexA) => {
    if (exactMatchedA.has(indexA)) {
      return;
    }

    const indexB = entriesB.findIndex(
      (entryB, candidateIndexB) => !matchedBIndices.has(candidateIndexB) && entryA.name === entryB.name,
    );

    if (indexB >= 0) {
      matchedBIndices.add(indexB);
      const entryB = entriesB[indexB];
      if (!deepEquals(entryA.normalized, entryB.normalized)) {
        marksDiff.modified.push({ name: entryA.name, oldAttrs: entryA.raw, newAttrs: entryB.raw });
      }
      return;
    }

    marksDiff.deleted.push({ name: entryA.name, attrs: entryA.raw });
  });

  // Third pass: unmatched marks in B are additions.
  entriesB.forEach((entryB, indexB) => {
    if (!matchedBIndices.has(indexB)) {
      marksDiff.added.push({ name: entryB.name, attrs: entryB.raw });
    }
  });

  const hasChanges = marksDiff.added.length > 0 || marksDiff.deleted.length > 0 || marksDiff.modified.length > 0;
  return hasChanges ? marksDiff : null;
}

/**
 * Recursively compares two objects and fills the diff buckets.
 *
 * @param objectA Baseline attributes being inspected.
 * @param objectB Updated attributes being inspected.
 * @param basePath Dotted path prefix used for nested keys.
 * @param diff Aggregated diff being mutated.
 * @param ignoreKeys Set of attribute keys to ignore.
 */
function diffObjects(
  objectA: Record<string, unknown>,
  objectB: Record<string, unknown>,
  basePath: string,
  diff: AttributesDiff,
  ignoreKeys: Set<string>,
): void {
  const keys = new Set([...Object.keys(objectA || {}), ...Object.keys(objectB || {})]);

  for (const key of keys) {
    if (ignoreKeys.has(key)) {
      continue;
    }

    const path = joinPath(basePath, key);
    const hasA = Object.prototype.hasOwnProperty.call(objectA, key);
    const hasB = Object.prototype.hasOwnProperty.call(objectB, key);

    if (hasA && !hasB) {
      recordDeletedValue(objectA[key], path, diff, ignoreKeys);
      continue;
    }

    if (!hasA && hasB) {
      recordAddedValue(objectB[key], path, diff, ignoreKeys);
      continue;
    }

    const valueA = objectA[key];
    const valueB = objectB[key];

    if (isPlainObject(valueA) && isPlainObject(valueB)) {
      diffObjects(valueA, valueB, path, diff, ignoreKeys);
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
 * @param ignoreKeys Set of attribute keys to ignore.
 */
function recordAddedValue(
  value: unknown,
  path: string,
  diff: Pick<AttributesDiff, 'added'>,
  ignoreKeys: Set<string>,
): void {
  if (isPlainObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (ignoreKeys.has(childKey)) {
        continue;
      }
      recordAddedValue(childValue, joinPath(path, childKey), diff, ignoreKeys);
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
 * @param ignoreKeys Set of attribute keys to ignore.
 */
function recordDeletedValue(
  value: unknown,
  path: string,
  diff: Pick<AttributesDiff, 'deleted'>,
  ignoreKeys: Set<string>,
): void {
  if (isPlainObject(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (ignoreKeys.has(childKey)) {
        continue;
      }
      recordDeletedValue(childValue, joinPath(path, childKey), diff, ignoreKeys);
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
export function deepEquals(a: unknown, b: unknown): boolean {
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
