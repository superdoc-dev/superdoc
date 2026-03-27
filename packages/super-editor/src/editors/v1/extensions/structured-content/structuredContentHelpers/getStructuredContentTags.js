import { findChildren } from '@core/helpers/findChildren';

/**
 * Get all structured content tags (inline and block) in the document
 * @category Helper
 * @param {import('prosemirror-state').EditorState} state Editor state
 * @returns {Array<{ node: import('prosemirror-model').Node, pos: number }>} All structured content nodes with positions
 * @example
 * const allTags = editor.helpers.getStructuredContentTags(editor.state)
 * console.log(`Found ${allTags.length} structured content elements`)
 */
export function getStructuredContentTags(state) {
  const result = findChildren(state.doc, (node) => {
    return node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock';
  });
  return result;
}
