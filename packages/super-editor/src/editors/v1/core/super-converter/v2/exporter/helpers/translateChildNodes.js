import { exportSchemaToJson } from '../../../exporter.js';

/**
 * Process child nodes, ignoring any that are not valid
 *
 * @param {import('@converter/exporter').SchemaNode[]} nodes The input nodes
 * @returns {import('@converter/exporter').XmlReadyNode[]} The processed child nodes
 */
export function translateChildNodes(params) {
  const { content: nodes } = params.node;
  if (!nodes) return [];

  const translatedNodes = [];
  const hyperlinkGroup = [];
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    const linkMark = _isLinkNode(node);

    // Group adjacent hyperlinks together to avoid breaking them up
    if (linkMark) {
      hyperlinkGroup.push(node);
      const nextNode = index + 1 < nodes.length ? nodes[index + 1] : null;
      const nextIsLink = _isLinkNode(nextNode, linkMark);
      if (nextIsLink) {
        index++;
        continue; // Continue to the next iteration to check the next node
      } else {
        let translatedLinkGroup = exportSchemaToJson({
          ...params,
          node: hyperlinkGroup[0],
          extraParams: { ...(params.extraParams || {}), hyperlinkGroup: hyperlinkGroup.slice() },
        });
        if (translatedLinkGroup instanceof Array) translatedNodes.push(...translatedLinkGroup);
        else translatedNodes.push(translatedLinkGroup);
        hyperlinkGroup.length = 0; // Clear the group
        index++;
        continue;
      }
    }

    let translatedNode = exportSchemaToJson({ ...params, node });

    if (translatedNode instanceof Array) translatedNodes.push(...translatedNode);
    else translatedNodes.push(translatedNode);

    index++;
  }

  // Filter out any null nodes
  return translatedNodes.filter((n) => n);
}

/**
 * Check if a node has a link mark, optionally matching a reference mark's attributes
 * @param {import('@converter/exporter').SchemaNode} node The node to check
 * @param {import('@converter/exporter').MarkType|null} [referenceMark] An optional reference mark to match attributes against
 * @returns {import('@converter/exporter').MarkType|null} The link mark if found (and matches), otherwise null
 */
function _isLinkNode(node, referenceMark = null) {
  if (!node || (!node.marks && !node.attrs?.marksAsAttrs)) return null;
  const marks = node.marks || node.attrs.marksAsAttrs;
  const linkMark = marks.find((mark) => mark.type === 'link');
  if (!linkMark) return null;
  if (referenceMark) {
    // If a reference mark is provided, ensure the link attributes match
    return _isSameLinkMark(linkMark.attrs, referenceMark.attrs) ? linkMark : null;
  }
  return linkMark;
}

function _isSameLinkMark(attrsA, attrsB) {
  for (let key of ['anchor', 'docLocation', 'history', 'href', 'rId', 'target']) {
    if (attrsA[key] != attrsB[key]) {
      return false;
    }
  }
  return true;
}
