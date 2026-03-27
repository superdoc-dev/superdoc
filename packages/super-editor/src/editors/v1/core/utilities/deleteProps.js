/**
 * Delete a property or an array of properties from an object.
 * @param obj Object
 * @param propOrProps Key or array of keys to remove.
 */
export function deleteProps(obj, propOrProps) {
  const props = typeof propOrProps === 'string' ? [propOrProps] : propOrProps;

  const removeNested = (target, pathParts, index = 0) => {
    if (!target || typeof target !== 'object') {
      return false;
    }

    const key = pathParts[index];
    const isLast = index === pathParts.length - 1;

    if (!(key in target)) {
      return Object.keys(target).length === 0;
    }

    if (isLast) {
      delete target[key];
    } else {
      const shouldDeleteChild = removeNested(target[key], pathParts, index + 1);
      if (shouldDeleteChild) {
        delete target[key];
      }
    }

    return Object.keys(target).length === 0;
  };

  const clonedObj = JSON.parse(JSON.stringify(obj));
  props.forEach((propPath) => {
    if (!propPath.includes('.')) {
      delete clonedObj[propPath];
      return;
    }

    removeNested(clonedObj, propPath.split('.'));
  });

  return Object.entries(clonedObj).reduce((acc, [key, value]) => {
    if (value == null) {
      return acc;
    }

    if (typeof value === 'object' && Object.keys(value).length === 0) {
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}
