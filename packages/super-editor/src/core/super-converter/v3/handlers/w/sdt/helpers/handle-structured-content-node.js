import { parseAnnotationMarks } from './handle-annotation-node';

/**
 * Detect the semantic control type from sdtPr child elements.
 * Returns a canonical controlType string matching the ContentControlType enum.
 * @param {Object|null} sdtPr
 * @returns {string|null}
 */
function detectControlType(sdtPr) {
  if (!sdtPr?.elements) return null;
  const names = sdtPr.elements.map((el) => el.name);

  if (names.includes('w:text')) return 'text';
  if (names.includes('w:date')) return 'date';
  if (names.includes('w14:checkbox') || names.includes('w:checkbox')) return 'checkbox';
  if (names.includes('w:comboBox')) return 'comboBox';
  if (names.includes('w:dropDownList')) return 'dropDownList';
  if (names.includes('w15:repeatingSection') || names.includes('w:repeatingSection')) return 'repeatingSection';
  if (names.includes('w15:repeatingSectionItem') || names.includes('w:repeatingSectionItem'))
    return 'repeatingSectionItem';
  if (names.includes('w:group')) return 'group';
  return null;
}

/**
 * Extract the appearance value from sdtPr.
 * @param {Object|null} sdtPr
 * @returns {string|null}
 */
function extractAppearance(sdtPr) {
  const el = sdtPr?.elements?.find((e) => e.name === 'w:appearance' || e.name === 'w15:appearance');
  const val = el?.attributes?.['w:val'] ?? el?.attributes?.['w15:val'];
  const valid = ['boundingBox', 'tags', 'hidden'];
  return valid.includes(val) ? val : null;
}

/**
 * Extract placeholder text from sdtPr.
 * @param {Object|null} sdtPr
 * @returns {string|null}
 */
function extractPlaceholder(sdtPr) {
  const el = sdtPr?.elements?.find((e) => e.name === 'w:placeholder');
  const docPart = el?.elements?.find((e) => e.name === 'w:docPart');
  return docPart?.attributes?.['w:val'] ?? null;
}

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

  // Lock mode
  const lockTag = sdtPr?.elements?.find((el) => el.name === 'w:lock');
  const lockValue = lockTag?.attributes?.['w:val'];
  const validModes = ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'];
  const lockMode = validModes.includes(lockValue) ? lockValue : 'unlocked';

  // Control type detection from sdtPr children
  const controlType = detectControlType(sdtPr);

  // Appearance and placeholder
  const appearance = extractAppearance(sdtPr);
  const placeholder = extractPlaceholder(sdtPr);

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
      controlType,
      type: controlType,
      appearance,
      placeholder,
      sdtPr,
    },
  };

  return result;
}
