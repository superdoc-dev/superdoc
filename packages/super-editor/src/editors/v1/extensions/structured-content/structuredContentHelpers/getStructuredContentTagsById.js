import { findChildren } from '@core/helpers/findChildren';

/**
 * Get structured content tag(s) by ID
 * @category Helper
 * @param {string | string[]} idOrIds Single ID or array of IDs to find
 * @param {import('prosemirror-state').EditorState} state Editor state
 * @returns {Array<{ node: import('prosemirror-model').Node, pos: number }>} Matching structured content nodes
 * @example
 * const field = editor.helpers.getStructuredContentTagsById('field-123', editor.state)
 * if (field.length) console.log('Found field:', field[0].node.attrs)
 */
export function getStructuredContentTagsById(idOrIds, state) {
  const result = findChildren(state.doc, (node) => {
    const isStructuredContent = ['structuredContent', 'structuredContentBlock'].includes(node.type.name);
    if (Array.isArray(idOrIds)) {
      return isStructuredContent && idOrIds.includes(node.attrs.id);
    } else {
      return isStructuredContent && node.attrs.id === idOrIds;
    }
  });
  return result;
}
