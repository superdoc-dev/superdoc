import type { AttributesDiff } from '../algorithm/attributes-diffing';

/**
 * Creates a deep clone for object-like values while preserving primitives.
 *
 * @typeParam T Value type.
 * @param value Value to clone.
 * @returns Cloned value for objects, or the original primitive.
 */
function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return structuredClone(value);
}

/**
 * Checks whether a value is a plain record-like object.
 *
 * @param value Value to inspect.
 * @returns `true` when value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Ensures all parent segments in a dotted path exist as objects.
 *
 * @param target Root object.
 * @param pathSegments Parent path segments.
 * @returns The deepest parent object for subsequent writes.
 */
function ensureParentObject(target: Record<string, unknown>, pathSegments: string[]): Record<string, unknown> {
  let current: Record<string, unknown> = target;

  for (const segment of pathSegments) {
    const next = current[segment];
    if (!isRecord(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  return current;
}

/**
 * Sets a value at a dotted path, creating intermediate parents when needed.
 *
 * @param target Root object to mutate.
 * @param path Dotted path (for example `a.b.c`).
 * @param value Value to assign.
 */
function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    return;
  }
  const leaf = segments.pop()!;
  const parent = ensureParentObject(target, segments);
  parent[leaf] = cloneValue(value);
}

/**
 * Removes now-empty parent objects after a leaf deletion.
 *
 * @param root Root object.
 * @param segments Parent segments that lead to the removed leaf.
 */
function pruneEmptyParents(root: Record<string, unknown>, segments: string[]): void {
  for (let idx = segments.length - 1; idx >= 0; idx -= 1) {
    const parentPath = segments.slice(0, idx);
    const currentKey = segments[idx];
    const parent =
      parentPath.length === 0
        ? root
        : (parentPath.reduce<Record<string, unknown> | undefined>((acc, key) => {
            if (!acc || !isRecord(acc[key])) {
              return undefined;
            }
            return acc[key] as Record<string, unknown>;
          }, root) ?? undefined);

    if (!parent || !isRecord(parent[currentKey])) {
      return;
    }

    if (Object.keys(parent[currentKey] as Record<string, unknown>).length === 0) {
      delete parent[currentKey];
      continue;
    }

    return;
  }
}

/**
 * Deletes a value at a dotted path and prunes empty ancestors.
 *
 * @param target Root object to mutate.
 * @param path Dotted path to remove.
 */
function deleteByPath(target: Record<string, unknown>, path: string): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    return;
  }
  const leaf = segments.pop()!;
  const parent =
    segments.length === 0
      ? target
      : (segments.reduce<Record<string, unknown> | undefined>((acc, key) => {
          if (!acc || !isRecord(acc[key])) {
            return undefined;
          }
          return acc[key] as Record<string, unknown>;
        }, target) ?? undefined);

  if (!parent) {
    return;
  }

  delete parent[leaf];
  pruneEmptyParents(target, segments);
}

/**
 * Applies an attributes diff payload to a target object in-place.
 *
 * @param target Target object to mutate.
 * @param diff Attributes diff to apply.
 * @returns `true` when at least one mutation was applied.
 */
export function applyAttributesDiff(target: Record<string, unknown>, diff: AttributesDiff | null | undefined): boolean {
  if (!diff) {
    return false;
  }

  let changed = false;

  for (const [path, value] of Object.entries(diff.added ?? {})) {
    setByPath(target, path, value);
    changed = true;
  }

  for (const [path, value] of Object.entries(diff.modified ?? {})) {
    setByPath(target, path, value.to);
    changed = true;
  }

  for (const path of Object.keys(diff.deleted ?? {})) {
    deleteByPath(target, path);
    changed = true;
  }

  return changed;
}
