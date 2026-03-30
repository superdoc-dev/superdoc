import { carbonCopy } from '../../../utilities/carbonCopy.js';
import {
  selectAlternateContentElements,
  translator as alternateContentTranslator,
} from '../../v3/handlers/mc/altermateContent/alternate-content-translator.js';

const ALTERNATE_CONTENT_NODE = 'mc:AlternateContent';

const skipHandlerResponse = { nodes: [], consumed: 0 };

const isAlternateContentNode = (node) => node?.name === ALTERNATE_CONTENT_NODE;

const resolveAlternateContentElements = (alternateContent) => {
  const { elements } = selectAlternateContentElements(alternateContent);
  if (!elements) return null;
  return elements;
};

const buildNodeWithoutAlternateContent = (node) => {
  const { elements } = node || {};
  if (!elements?.length) return null;

  let replaced = false;
  const updatedElements = [];

  elements.forEach((element) => {
    if (isAlternateContentNode(element)) {
      const resolved = resolveAlternateContentElements(element);
      if (resolved) {
        updatedElements.push(...resolved);
        replaced = true;
        return;
      }

      updatedElements.push(carbonCopy(element));
      return;
    }

    updatedElements.push(carbonCopy(element));
  });

  if (!replaced) return null;

  const clone = carbonCopy(node);
  clone.elements = updatedElements;
  return clone;
};

/**
 * @type {import("docxImporter").NodeHandler}
 */
const handleAlternateChoice = (params) => {
  const { nodes, nodeListHandler } = params;
  if (!nodes?.length) {
    return skipHandlerResponse;
  }

  const [currentNode] = nodes;

  if (isAlternateContentNode(currentNode)) {
    const nodeForTranslator = currentNode?.type
      ? currentNode
      : {
          ...currentNode,
          type: 'element',
        };
    const translated = alternateContentTranslator.encode({
      ...params,
      nodes: [nodeForTranslator],
      extraParams: { ...(params.extraParams || {}), node: nodeForTranslator },
    });
    if (!translated) {
      return skipHandlerResponse;
    }

    const nodesArray = Array.isArray(translated) ? translated : [translated];
    return { nodes: nodesArray, consumed: 1 };
  }

  const sanitizedNode = buildNodeWithoutAlternateContent(currentNode);
  if (!sanitizedNode) {
    return skipHandlerResponse;
  }

  const result = nodeListHandler.handler({
    ...params,
    nodes: [sanitizedNode],
    path: [...(params.path || []), sanitizedNode],
  });

  return { nodes: result, consumed: 1 };
};

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const alternateChoiceHandler = {
  handlerName: 'alternateChoiceHandler',
  handler: handleAlternateChoice,
};
