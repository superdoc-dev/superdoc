import { Fragment } from 'prosemirror-model';

/**
 * Materialize plain text into inline ProseMirror content, upgrading literal tab
 * characters to real tab nodes when the schema supports them.
 *
 * @param {import('prosemirror-model').Schema} schema
 * @param {string} text
 * @param {import('prosemirror-model').Mark[]} [marks]
 * @returns {{
 *   content: import('prosemirror-model').Node | import('prosemirror-model').Fragment,
 *   nodes: import('prosemirror-model').Node[],
 *   size: number,
 *   hasSpecialInlineNodes: boolean,
 * }}
 */
export function buildInlineContentFromText(schema, text, marks = []) {
  const normalizedMarks = Array.isArray(marks) && marks.length > 0 ? marks : undefined;
  const tabType = schema?.nodes?.tab;

  if (!text.includes('\t') || !tabType) {
    const textNode = schema.text(text, normalizedMarks);
    return {
      content: textNode,
      nodes: [textNode],
      size: textNode.nodeSize,
      hasSpecialInlineNodes: false,
    };
  }

  const nodes = [];
  const parts = text.split('\t');

  parts.forEach((part, index) => {
    if (part.length > 0) {
      nodes.push(schema.text(part, normalizedMarks));
    }

    if (index < parts.length - 1) {
      nodes.push(tabType.create(null, undefined, normalizedMarks));
    }
  });

  const content = nodes.length === 1 ? nodes[0] : Fragment.fromArray(nodes);
  const size = nodes.reduce((sum, node) => sum + node.nodeSize, 0);

  return {
    content,
    nodes,
    size,
    hasSpecialInlineNodes: nodes.some((node) => node.type?.name === 'tab'),
  };
}
