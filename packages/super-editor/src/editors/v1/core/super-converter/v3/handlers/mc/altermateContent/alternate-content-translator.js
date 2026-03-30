import { NodeTranslator } from '../../../node-translator/node-translator';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

/** @type {Set<string>} */
export const SUPPORTED_ALTERNATE_CONTENT_REQUIRES = new Set([
  'wps',
  'wpg',
  'wp14',
  'w14',
  'w15',
  'w16',
  'w16cex',
  'w16cid',
  'w16du',
  'w16sdtdh',
  'w16sdtfl',
  'w16se',
]);

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'mc:AlternateContent';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = [];

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = [];

/**
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
function encode(params) {
  const { nodeListHandler } = params;
  const { node } = params.extraParams;

  if (!node || !node.type) {
    return null;
  }

  const { branch, elements } = selectAlternateContentElements(node);
  if (!elements) {
    return null;
  }

  return nodeListHandler.handler({
    ...params,
    nodes: elements,
    path: buildPath(params.path, node, branch),
  });
}

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params) {
  const { node } = params;
  const { drawingContent } = node.attrs;

  // Handle modern DrawingML content (existing logic)
  const drawing = {
    name: 'w:drawing',
    elements: [...(drawingContent ? [...(drawingContent.elements || [])] : [])],
  };

  const choice = {
    name: 'mc:Choice',
    attributes: { Requires: 'wps' },
    elements: [drawing],
  };

  return {
    name: 'mc:AlternateContent',
    elements: [choice],
  };
}

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * Selects the best-fit mc:AlternateContent branch, mirroring the legacy importer logic.
 * @param {import('@translator').SCExtraParams['node']} node
 * @returns {{ branch: import('@translator').XmlNode|null, elements: import('@translator').XmlNode[]|null }}
 */
export function selectAlternateContentElements(node) {
  if (!node?.elements?.length) {
    return { branch: null, elements: null };
  }

  const choices = node.elements.filter((el) => el?.name === 'mc:Choice');
  const fallback = node.elements.find((el) => el?.name === 'mc:Fallback');

  const supportedChoice = choices.find((choice) => {
    const requiresAttr = choice?.attributes?.Requires || choice?.attributes?.requires;
    if (!requiresAttr) return false;

    return requiresAttr
      .split(/\s+/)
      .filter(Boolean)
      .some((namespace) => SUPPORTED_ALTERNATE_CONTENT_REQUIRES.has(namespace));
  });

  const branch = supportedChoice || fallback || choices[0] || null;
  const selectedElements = branch?.elements;
  if (!selectedElements) {
    return { branch, elements: null };
  }

  return {
    branch,
    elements: carbonCopy(selectedElements),
  };
}

/**
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);

/**
 * Builds the traversal path to hand off to nested handlers.
 * @param {Array<import('@translator').XmlNode>} [existingPath]
 * @param {import('@translator').XmlNode} node
 * @param {import('@translator').XmlNode|null} branch
 * @returns {Array<import('@translator').XmlNode>}
 */
function buildPath(existingPath = [], node, branch) {
  const path = [...existingPath];
  if (node) path.push(node);
  if (branch) path.push(branch);
  return path;
}
