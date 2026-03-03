/**
 * Computes dot-notation paths whose values differ between two structures.
 *
 * The algorithm is structural:
 * - primitives are compared with `Object.is`
 * - plain objects are traversed by key
 * - arrays are traversed by index (`[0]`, `[1]`, ...)
 *
 * Returned paths are stable (sorted) and unique.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinObjectPath(basePath: string, key: string): string {
  return basePath ? `${basePath}.${key}` : key;
}

function joinArrayPath(basePath: string, index: number): string {
  return `${basePath}[${index}]`;
}

function collectDiffPaths(beforeValue: unknown, afterValue: unknown, currentPath: string, out: Set<string>): void {
  if (Object.is(beforeValue, afterValue)) {
    return;
  }

  if (Array.isArray(beforeValue) !== Array.isArray(afterValue)) {
    const arraySide = Array.isArray(beforeValue) ? beforeValue : Array.isArray(afterValue) ? afterValue : null;
    if (arraySide) {
      if (arraySide.length === 0) {
        if (currentPath.length > 0) out.add(currentPath);
        return;
      }

      for (let index = 0; index < arraySide.length; index += 1) {
        const beforeEntry = Array.isArray(beforeValue) ? beforeValue[index] : undefined;
        const afterEntry = Array.isArray(afterValue) ? afterValue[index] : undefined;
        collectDiffPaths(beforeEntry, afterEntry, joinArrayPath(currentPath, index), out);
      }
      return;
    }
  }

  if (isPlainObject(beforeValue) !== isPlainObject(afterValue)) {
    const objectSide = isPlainObject(beforeValue) ? beforeValue : isPlainObject(afterValue) ? afterValue : null;
    if (objectSide) {
      const keys = Object.keys(objectSide).sort();
      if (keys.length === 0) {
        if (currentPath.length > 0) out.add(currentPath);
        return;
      }

      for (const key of keys) {
        const beforeEntry = isPlainObject(beforeValue) ? beforeValue[key] : undefined;
        const afterEntry = isPlainObject(afterValue) ? afterValue[key] : undefined;
        collectDiffPaths(beforeEntry, afterEntry, joinObjectPath(currentPath, key), out);
      }
      return;
    }
  }

  if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
    const maxLength = Math.max(beforeValue.length, afterValue.length);
    for (let index = 0; index < maxLength; index += 1) {
      collectDiffPaths(beforeValue[index], afterValue[index], joinArrayPath(currentPath, index), out);
    }
    return;
  }

  if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
    const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);
    const sortedKeys = [...keys].sort();
    for (const key of sortedKeys) {
      collectDiffPaths(beforeValue[key], afterValue[key], joinObjectPath(currentPath, key), out);
    }
    return;
  }

  if (currentPath.length > 0) {
    out.add(currentPath);
  }
}

/**
 * Returns all changed paths between `beforeValue` and `afterValue`.
 *
 * @param beforeValue - Previous structure snapshot.
 * @param afterValue - New structure snapshot.
 * @param basePath - Optional root prefix for returned paths.
 */
export function diffObjectPaths(beforeValue: unknown, afterValue: unknown, basePath = ''): string[] {
  const paths = new Set<string>();
  collectDiffPaths(beforeValue, afterValue, basePath, paths);
  return [...paths].sort();
}
