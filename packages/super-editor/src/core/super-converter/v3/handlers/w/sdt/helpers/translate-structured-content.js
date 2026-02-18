import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { convertSdtContentToRuns } from './convert-sdt-content-to-runs.js';

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object|Array|Object[]} The XML representation.
 */
export function translateStructuredContent(params) {
  const { node, isFinalDoc } = params;

  const childContent = translateChildNodes({ ...params, node });
  const childElements = Array.isArray(childContent) ? childContent : [childContent];

  if (isFinalDoc) {
    if (node?.type === 'structuredContent') {
      // For final docs, inline structured content is flattened to run elements,
      // removing the SDT wrapper so content renders as plain text in the output DOCX.
      return convertSdtContentToRuns(childElements);
    }

    if (node?.type === 'structuredContentBlock') {
      // For final docs, block-level structured content (tables, paragraphs) is unwrapped
      // from the SDT container. Single elements are returned directly, multiple elements as an array.
      return childElements.length === 1 ? childElements[0] : childElements;
    }
  }

  // We build the sdt node elements here, and re-add passthrough sdtPr node
  const sdtContent = { name: 'w:sdtContent', elements: childElements };
  const sdtPr = generateSdtPrTagForStructuredContent({ node });
  const nodeElements = [sdtPr, sdtContent];

  const result = {
    name: 'w:sdt',
    elements: nodeElements,
  };

  return result;
}

function generateSdtPrTagForStructuredContent({ node }) {
  const { attrs = {} } = node;

  const id = {
    name: 'w:id',
    type: 'element',
    attributes: { 'w:val': attrs.id },
  };
  const alias = {
    name: 'w:alias',
    type: 'element',
    attributes: { 'w:val': attrs.alias },
  };
  const tag = {
    name: 'w:tag',
    type: 'element',
    attributes: { 'w:val': attrs.tag },
  };
  const lock = {
    name: 'w:lock',
    type: 'element',
    attributes: { 'w:val': attrs.lockMode },
  };

  const resultElements = [];
  if (attrs.id) resultElements.push(id);
  if (attrs.alias) resultElements.push(alias);
  if (attrs.tag) resultElements.push(tag);
  if (attrs.lockMode && attrs.lockMode !== 'unlocked') resultElements.push(lock);

  if (attrs.sdtPr) {
    const elements = attrs.sdtPr.elements || [];
    const elementsToExclude = ['w:id', 'w:alias', 'w:tag', 'w:lock'];
    const restElements = elements.filter((el) => !elementsToExclude.includes(el.name));
    const result = {
      name: 'w:sdtPr',
      type: 'element',
      elements: [...resultElements, ...restElements],
    };
    return result;
  }

  const result = {
    name: 'w:sdtPr',
    type: 'element',
    elements: resultElements,
  };

  return result;
}
