// @ts-check
import { translator as wPNodeTranslator } from '../../v3/handlers/w/p/index.js';
import { BLOCK_FIELD_XML_NAMES } from '../../v3/handlers/sd/shared/block-field-xml-names.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

const PARAGRAPH_PROPERTIES_XML_NAME = 'w:pPr';

const hasMeaningfulParagraphContent = (elements = []) =>
  elements.some((element) => element?.name && element.name !== PARAGRAPH_PROPERTIES_XML_NAME);

const findParagraphProperties = (elements = []) =>
  elements.find((element) => element?.name === PARAGRAPH_PROPERTIES_XML_NAME) ?? null;

const hasParagraphProperties = (elements = []) =>
  elements.some((element) => element?.name === PARAGRAPH_PROPERTIES_XML_NAME);

const cloneParagraphPropertiesForRenderedResult = (paragraphProperties) => {
  const elements = (paragraphProperties.elements || [])
    .filter((element) => element?.name !== 'w:sectPr')
    .map((element) => carbonCopy(element));
  if (elements.length === 0) return null;
  return {
    ...carbonCopy(paragraphProperties),
    elements,
  };
};

const inheritWrapperParagraphProperties = (blockFieldElement, paragraphProperties) => {
  if (!paragraphProperties) return blockFieldElement;

  const fieldElements = Array.isArray(blockFieldElement?.elements) ? blockFieldElement.elements : [];
  const firstParagraphIndex = fieldElements.findIndex((element) => element?.name === 'w:p');
  if (firstParagraphIndex < 0) return blockFieldElement;

  const firstParagraph = fieldElements[firstParagraphIndex];
  const firstParagraphElements = Array.isArray(firstParagraph.elements) ? firstParagraph.elements : [];
  if (hasParagraphProperties(firstParagraphElements)) return blockFieldElement;

  const renderedParagraphProperties = cloneParagraphPropertiesForRenderedResult(paragraphProperties);
  const inheritedFirstParagraph = {
    ...firstParagraph,
    elements: renderedParagraphProperties
      ? [renderedParagraphProperties, ...firstParagraphElements]
      : firstParagraphElements,
  };

  return {
    ...blockFieldElement,
    attributes: {
      ...(blockFieldElement.attributes || {}),
      wrapperParagraphProperties: carbonCopy(paragraphProperties),
    },
    elements: fieldElements.map((element, index) =>
      index === firstParagraphIndex ? inheritedFirstParagraph : element,
    ),
  };
};

const hoistBlockFieldNodes = (params, paragraphNode) => {
  const paragraphElements = Array.isArray(paragraphNode?.elements) ? paragraphNode.elements : [];
  const blockFieldElements = paragraphElements.filter((element) => BLOCK_FIELD_XML_NAMES.has(element?.name));
  if (blockFieldElements.length === 0) return null;

  const nodes = [];
  const remainingElements = paragraphElements.filter((element) => !BLOCK_FIELD_XML_NAMES.has(element?.name));
  const wrapperParagraphProperties = findParagraphProperties(remainingElements);
  const shouldTransferWrapperProperties = !hasMeaningfulParagraphContent(remainingElements);

  if (hasMeaningfulParagraphContent(remainingElements)) {
    const paragraph = wPNodeTranslator.encode({
      ...params,
      nodes: [
        {
          ...paragraphNode,
          elements: remainingElements,
        },
      ],
    });
    if (paragraph) {
      nodes.push(paragraph);
    }
  }

  blockFieldElements.forEach((blockFieldElement) => {
    const fieldElement = shouldTransferWrapperProperties
      ? inheritWrapperParagraphProperties(blockFieldElement, wrapperParagraphProperties)
      : blockFieldElement;
    nodes.push(
      ...params.nodeListHandler.handler({
        ...params,
        nodes: [fieldElement],
        path: [...(params.path || []), paragraphNode],
      }),
    );
  });

  return nodes;
};

/**
 * Special cases of w:p based on paragraph properties
 *
 * If we detect a list node, we need to get all nodes that are also lists and process them together
 * in order to combine list item nodes into list nodes.
 *
 * @param {import('../../v3/node-translator').SCEncoderConfig} params
 * @returns {Object} Handler result
 */
export const handleParagraphNode = (params) => {
  const { nodes } = params;
  if (nodes.length === 0 || nodes[0].name !== 'w:p') {
    return { nodes: [], consumed: 0 };
  }

  const hoistedNodes = hoistBlockFieldNodes(params, nodes[0]);
  if (hoistedNodes) {
    return { nodes: hoistedNodes, consumed: 1 };
  }

  const schemaNode = wPNodeTranslator.encode(params);
  const newNodes = Array.isArray(schemaNode) ? schemaNode : schemaNode ? [schemaNode] : [];
  return { nodes: newNodes, consumed: 1 };
};

/**
 * Paragraph node handler entity
 * @type {Object} Handler entity
 */
export const paragraphNodeHandlerEntity = {
  handlerName: 'paragraphNodeHandler',
  handler: handleParagraphNode,
};
