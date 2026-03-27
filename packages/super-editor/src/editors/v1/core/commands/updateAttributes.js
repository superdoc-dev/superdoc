import { getMarkType } from '../helpers/getMarkType.js';
import { getNodeType } from '../helpers/getNodeType.js';
import { getSchemaTypeNameByName } from '../helpers/getSchemaTypeNameByName.js';

/**
 * Update attributes of a node or mark.
 * @param {import('@tiptap/core').NodeType | import('@tiptap/core').MarkType | string} typeOrName - The type or name of the node/mark.
 * @param {Record<string, any>} attrs - Attributes to apply. Supports dot notation for nested properties.
 * @returns {(params: { tr: import('prosemirror-state').Transaction, state: import('prosemirror-state').EditorState, dispatch?: (tr: import('prosemirror-state').Transaction) => void }) => boolean}
 */
//prettier-ignore
export const updateAttributes = (typeOrName, attrs = {}) => ({ tr, state, dispatch }) => {
  let nodeType = null;
  let markType = null;

  const schemaType = getSchemaTypeNameByName(
    typeof typeOrName === 'string' ? typeOrName : typeOrName.name,
    state.schema,
  );

  if (!schemaType) return false;

  if (schemaType === 'node') {
    nodeType = getNodeType(typeOrName, state.schema);
  }
  if (schemaType === 'mark') {
    markType = getMarkType(typeOrName, state.schema);
  }

  if (dispatch) {
    tr.selection.ranges.forEach((range) => {
      const from = range.$from.pos;
      const to = range.$to.pos;

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (nodeType && nodeType === node.type) {
          const resolvedAttrs = mergeAttributes(node.attrs, attrs);
          tr.setNodeMarkup(pos, undefined, resolvedAttrs);
        }

        if (markType && node.marks.length) {
          node.marks.forEach((mark) => {
            if (markType === mark.type) {
              const trimmedFrom = Math.max(pos, from);
              const trimmedTo = Math.min(pos + node.nodeSize, to);

              const resolvedAttrs = mergeAttributes(mark.attrs, attrs);
              tr.addMark(trimmedFrom, trimmedTo, markType.create(resolvedAttrs));
            }
          });
        }
      });
    });
    dispatch(tr);
  }

  return true;
};

/**
 * Determines if a value is a plain object.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Assigns a value to a dot-notation path within an object.
 * @param {Record<string, any>} target
 * @param {string} path
 * @param {any} value
 */
const assignNestedValue = (target, path, value) => {
  if (!path.includes('.')) {
    target[path] = value;
    return;
  }

  const parts = path.split('.');
  let current = target;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      current[part] = value;
    } else {
      if (!isPlainObject(current[part])) {
        current[part] = {};
      }
      current = current[part];
    }
  }
};

/**
 * Merges existing attributes with new ones that may include dot-notation keys.
 * @param {Record<string, any>} existingAttrs
 * @param {Record<string, any>} newAttrs
 * @returns {Record<string, any>}
 */
const mergeAttributes = (existingAttrs = {}, newAttrs = {}) => {
  const expandedAttrs = JSON.parse(JSON.stringify(existingAttrs));

  Object.entries(newAttrs).forEach(([key, value]) => {
    assignNestedValue(expandedAttrs, key, value);
  });

  return expandedAttrs;
};
