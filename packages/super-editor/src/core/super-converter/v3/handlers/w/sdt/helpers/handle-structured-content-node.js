import { parseAnnotationMarks } from './handle-annotation-node';

/**
 * @param {Object} params
 * @returns {Object|null}
 */
export function handleStructuredContentNode(params) {
  const { nodes, nodeListHandler } = params;

  if (nodes.length === 0 || nodes[0].name !== 'w:sdt') {
    return null;
  }

  const node = nodes[0];
  const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');
  const sdtContent = node.elements.find((el) => el.name === 'w:sdtContent');

  const id = sdtPr?.elements?.find((el) => el.name === 'w:id');
  const tag = sdtPr?.elements?.find((el) => el.name === 'w:tag');
  const alias = sdtPr?.elements?.find((el) => el.name === 'w:alias');

  // Get the lock tag and value
  const lockTag = sdtPr?.elements?.find((el) => el.name === 'w:lock');
  const lockValue = lockTag?.attributes?.['w:val'];
  const validModes = ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'];
  const lockMode = validModes.includes(lockValue) ? lockValue : 'unlocked';

  if (!sdtContent) {
    return null;
  }

  const paragraph = sdtContent.elements?.find((el) => el.name === 'w:p');
  const table = sdtContent.elements?.find((el) => el.name === 'w:tbl');
  const { marks } = parseAnnotationMarks(sdtContent);
  const translatedContent = nodeListHandler.handler({
    ...params,
    nodes: sdtContent.elements,
    path: [...(params.path || []), sdtContent],
  });

  const isBlockNode = paragraph || table;
  const sdtContentType = isBlockNode ? 'structuredContentBlock' : 'structuredContent';

  let result = {
    type: sdtContentType,
    content: translatedContent,
    marks,
    attrs: {
      id: id?.attributes?.['w:val'] || null,
      tag: tag?.attributes?.['w:val'] || null,
      alias: alias?.attributes?.['w:val'] || null,
      lockMode,
      sdtPr,
    },
  };

  return result;
}
