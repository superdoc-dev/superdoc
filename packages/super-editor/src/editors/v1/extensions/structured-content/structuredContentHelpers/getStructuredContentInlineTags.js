import { findChildren } from '@core/helpers/findChildren';

/**
 * Get all inline structured content tags in the document
 * @category Helper
 * @param {import('prosemirror-state').EditorState} state Editor state
 * @returns {Array<{ node: import('prosemirror-model').Node, pos: number }>} All inline structured content nodes
 * @example
 * const inlines = editor.helpers.getStructuredContentInlineTags(editor.state)
 * console.log(`Found ${inlines.length} inline fields`)
 */
export function getStructuredContentInlineTags(state) {
  const result = findChildren(state.doc, (node) => node.type.name === 'structuredContent');
  return result;
}
