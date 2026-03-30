import { findChildren } from '@core/helpers/findChildren';
import { getGroup } from './tagUtils';

/**
 * Get structured content nodes by group identifier.
 * Groups are JSON-encoded in the tag attribute as { "group": "value" }.
 * @category Helper
 * @param {string | string[]} groupOrGroups - Single group or array of groups to find
 * @param {import('prosemirror-state').EditorState} state - Editor state
 * @returns {Array<{ node: import('prosemirror-model').Node, pos: number }>} Matching structured content nodes
 * @example
 * // Find all fields with group "customer-info"
 * const fields = editor.helpers.getStructuredContentByGroup('customer-info', editor.state)
 *
 * // Find fields with multiple groups
 * const fields = editor.helpers.getStructuredContentByGroup(['customer-info', 'terms'], editor.state)
 */
export function getStructuredContentByGroup(groupOrGroups, state) {
  const searchGroups = Array.isArray(groupOrGroups) ? groupOrGroups : [groupOrGroups];

  const result = findChildren(state.doc, (node) => {
    const isStructuredContent = ['structuredContent', 'structuredContentBlock'].includes(node.type.name);
    if (!isStructuredContent) {
      return false;
    }

    const nodeGroup = getGroup(node.attrs.tag);
    if (!nodeGroup) {
      return false;
    }

    return searchGroups.includes(nodeGroup);
  });

  return result;
}
