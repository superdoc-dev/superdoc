import { findChildren } from '@core/helpers/findChildren';

/**
 * Get all block-level structured content tags in the document
 * @category Helper
 * @param {import('prosemirror-state').EditorState} state Editor state
 * @returns {Array<{ node: import('prosemirror-model').Node, pos: number }>} All structured content block nodes
 * @example
 * const blocks = editor.helpers.getStructuredContentBlockTags(editor.state)
 * console.log(`Found ${blocks.length} structured content blocks`)
 */
export function getStructuredContentBlockTags(state) {
  const result = findChildren(state.doc, (node) => node.type.name === 'structuredContentBlock');
  return result;
}
