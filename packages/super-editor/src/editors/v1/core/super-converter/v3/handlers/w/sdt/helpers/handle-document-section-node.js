import { parseTagValueJSON } from './parse-tag-value-json';

/**
 * Handle document section node. Special case of w:sdt nodes
 * @param {Object} params - The parameters containing nodes and nodeListHandler
 * @returns {Object|null} An object containing the processed node and consumed count
 */
export function handleDocumentSectionNode(params) {
  const { nodes, nodeListHandler } = params;

  if (nodes.length === 0 || nodes[0].name !== 'w:sdt') {
    return null;
  }

  const node = nodes[0];
  const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');
  const tag = sdtPr?.elements.find((el) => el.name === 'w:tag');
  const tagValue = parseTagValueJSON(tag?.attributes?.['w:val']);

  const idTag = sdtPr?.elements.find((el) => el.name === 'w:id');
  const id = idTag?.attributes?.['w:val'] || tagValue.id || null;

  const titleTag = sdtPr?.elements.find((el) => el.name === 'w:alias');
  const title = titleTag?.attributes?.['w:val'] || tagValue.title || null;

  const { description } = tagValue;

  // Parse w:lock element for section locking
  const lockTag = sdtPr?.elements.find((el) => el.name === 'w:lock');
  const lockValue = lockTag?.attributes?.['w:val'];
  const isLocked = lockValue === 'sdtContentLocked';

  const sdtContent = node.elements.find((el) => el.name === 'w:sdtContent');
  const translatedContent = nodeListHandler.handler({
    ...params,
    nodes: sdtContent?.elements,
    path: [...(params.path || []), node],
  });

  const result = {
    type: 'documentSection',
    content: translatedContent,
    attrs: {
      id,
      title,
      description,
      isLocked,
      ...(sdtPr && { sdtPr }), // Passthrough for round-trip preservation of unknown elements only if it exists
    },
  };

  return result;
}
