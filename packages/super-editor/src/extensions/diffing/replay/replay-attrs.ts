import { AttributesDiff } from '../algorithm/attributes-diffing.ts';

/**
 * Applies an attribute diff to an attributes object.
 *
 * @param params Input bundle for applying attribute diffs.
 * @param params.attrs Base attributes object to update.
 * @param params.diff Attribute diff to apply.
 * @returns Updated attributes object.
 */
export function applyAttrsDiff({
  attrs,
  diff,
}: {
  attrs: Record<string, unknown>;
  diff: AttributesDiff;
}): Record<string, unknown> {
  const updated = JSON.parse(JSON.stringify(attrs ?? {}));

  Object.entries(diff.added || {}).forEach(([path, value]) => {
    setNestedValue(updated, path, value);
  });

  Object.entries(diff.modified || {}).forEach(([path, change]) => {
    setNestedValue(updated, path, change.to);
  });

  Object.keys(diff.deleted || {}).forEach((path) => {
    deleteNestedValue(updated, path);
  });

  return updated;
}

/**
 * Assigns a value to a dot-notation path within an object.
 *
 * @param target Attributes object to mutate.
 * @param path Dot-notation path to update.
 * @param value Value to assign at the path.
 */
const setNestedValue = (target: Record<string, unknown>, path: string, value: unknown) => {
  if (!path.includes('.')) {
    target[path] = value;
    return;
  }

  const parts = path.split('.');
  let current: Record<string, unknown> = target;

  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      current[key] = value;
    } else {
      if (!isPlainObject(current[key])) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
  }
};

/**
 * Deletes a value at a dot-notation path within an object.
 *
 * @param target Attributes object to mutate.
 * @param path Dot-notation path to delete.
 */
const deleteNestedValue = (target: Record<string, unknown>, path: string) => {
  if (!path.includes('.')) {
    delete target[path];
    return;
  }

  const parts = path.split('.');
  let current: Record<string, unknown> = target;

  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      delete current[key];
      return;
    }
    if (!isPlainObject(current[key])) {
      return;
    }
    current = current[key] as Record<string, unknown>;
  }
};

/**
 * Determines whether a value is a plain object.
 *
 * @param value Value to inspect.
 * @returns True when the value is a non-null object and not an array.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};
