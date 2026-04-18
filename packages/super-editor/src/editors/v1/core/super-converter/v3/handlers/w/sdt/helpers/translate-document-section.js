import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';

/**
 * Translate a structured content block node to its XML representation.
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation of the structured content block.
 */
export function translateDocumentSection(params) {
  const { node } = params;
  const { attrs = {} } = node;

  const childContent = translateChildNodes({ ...params, nodes: node.content });

  // We build the sdt node elements here, and re-add passthrough sdtPr node
  const nodeElements = [
    {
      name: 'w:sdtContent',
      elements: childContent,
    },
  ];

  const exportedTag = JSON.stringify({
    type: 'documentSection',
    description: attrs.description,
  });

  const sdtPr = generateSdtPrTagForDocumentSection(attrs.id, attrs.title, exportedTag, attrs.sdtPr);

  // If the section is locked, we add the lock tag
  const { isLocked } = attrs;
  if (isLocked) {
    sdtPr.elements.push({
      name: 'w:lock',
      attributes: {
        'w:val': 'sdtContentLocked',
      },
    });
  }

  nodeElements.unshift(sdtPr);

  const result = {
    name: 'w:sdt',
    elements: nodeElements,
  };

  return result;
}

/**
 * Generate the sdtPr tag for a document section.
 * @param {string} id - The unique identifier for the section.
 * @param {string} title - The title of the section.
 * @param {string} tag - The tag containing section metadata.
 * @param {Object} sdtPr - The original sdtPr element for passthrough.
 * @returns {Object} The sdtPr tag object.
 */
export const generateSdtPrTagForDocumentSection = (id, title, tag, sdtPr) => {
  const coreElements = [
    {
      name: 'w:id',
      attributes: {
        'w:val': id,
      },
    },
    {
      name: 'w:alias',
      attributes: {
        'w:val': title,
      },
    },
    {
      name: 'w:tag',
      attributes: {
        'w:val': tag,
      },
    },
  ];

  // Passthrough: preserve any sdtPr elements not explicitly managed
  // Explicitly managed: w:id, w:alias, w:tag, w:lock (lock is added separately based on isLocked attr)
  if (sdtPr?.elements && Array.isArray(sdtPr.elements)) {
    const elementsToExclude = ['w:id', 'w:alias', 'w:tag', 'w:lock'];
    const passthroughElements = sdtPr.elements.filter((el) => el && el.name && !elementsToExclude.includes(el.name));
    coreElements.push(...passthroughElements);
  }

  return {
    name: 'w:sdtPr',
    elements: coreElements,
  };
};
