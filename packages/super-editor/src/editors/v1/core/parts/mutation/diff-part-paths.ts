/**
 * Computes changed JSON Pointer paths between two OOXML JSON snapshots.
 *
 * Used by the mutation pipeline to determine `changedPaths` and `changed` flag.
 * Paths follow RFC 6901 JSON Pointer format relative to the part root.
 */

/**
 * Returns a list of JSON Pointer paths that differ between `before` and `after`.
 * Returns an empty array if the two values are deeply equal.
 *
 * Traverses to leaf level for objects/arrays. Stops recursion at primitives.
 */
export function diffPartPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (before === after) return [];

  if (before === null || after === null || typeof before !== typeof after) {
    return [prefix || '/'];
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) {
      return [prefix || '/'];
    }
    return diffArrayPaths(before, after, prefix);
  }

  if (typeof before === 'object') {
    return diffObjectPaths(before as Record<string, unknown>, after as Record<string, unknown>, prefix);
  }

  // Primitives that are not strictly equal
  return [prefix || '/'];
}

function diffObjectPaths(before: Record<string, unknown>, after: Record<string, unknown>, prefix: string): string[] {
  const paths: string[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const escapedKey = key.replace(/~/g, '~0').replace(/\//g, '~1');
    const childPrefix = `${prefix}/${escapedKey}`;

    if (!(key in before)) {
      paths.push(childPrefix);
    } else if (!(key in after)) {
      paths.push(childPrefix);
    } else {
      paths.push(...diffPartPaths(before[key], after[key], childPrefix));
    }
  }

  return paths;
}

function diffArrayPaths(before: unknown[], after: unknown[], prefix: string): string[] {
  const paths: string[] = [];
  const maxLen = Math.max(before.length, after.length);

  for (let i = 0; i < maxLen; i++) {
    const childPrefix = `${prefix}/${i}`;

    if (i >= before.length || i >= after.length) {
      paths.push(childPrefix);
    } else {
      paths.push(...diffPartPaths(before[i], after[i], childPrefix));
    }
  }

  return paths;
}
