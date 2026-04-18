// @ts-check
import { NodeTranslator } from '@translator';
import { generateDocxRandomId } from '@helpers/generateDocxRandomId.js';
import { exportSchemaToJson } from '@core/super-converter/exporter';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:hyperlink';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'link';

/**
 * Helper to create one-to-one attribute handlers.
 * @param {string} xmlName - The XML attribute name.
 * @param {string} sdName - The SuperDoc attribute name.
 * @returns {import('@translator').AttrConfig} The attribute handler object.
 */
const _createAttributeHandler = (xmlName, sdName) => ({
  xmlName,
  sdName,
  encode: (attributes) => attributes[xmlName],
  decode: (attributes) => attributes[sdName],
});

/**
 * The attributes that can be mapped between OOXML and SuperDoc.
 * Note: These are specifically OOXML valid attributes for a given node.
 * @type {import('@translator').AttrConfig[]}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 1276
 */
const validXmlAttributes = [
  _createAttributeHandler('w:anchor', 'anchor'),
  _createAttributeHandler('w:docLocation', 'docLocation'),
  {
    xmlName: 'w:history',
    sdName: 'history',
    encode: (attributes) =>
      attributes['w:history'] == null ? null : attributes['w:history'] === '1' || attributes['w:history'] === 'true',
    decode: (attributes) => (attributes['history'] == null ? null : attributes['history'] ? '1' : '0'),
  },
  _createAttributeHandler('w:tooltip', 'tooltip'),
  _createAttributeHandler('r:id', 'rId'),
  _createAttributeHandler('w:tgtFrame', 'target'),
];

/**
 * Encode a hyperlink element as a SuperDoc 'link' mark.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs) => {
  const { nodes, docx, nodeListHandler } = params;
  const node = nodes[0];

  let href = _resolveHref(docx, encodedAttrs, params.filename);

  // Add marks to the run nodes and process them
  const linkMark = { type: 'link', attrs: { ...encodedAttrs, href } };
  const referenceNodeTypes = ['sd:pageReference', 'sd:autoPageNumber', 'sd:totalPageNumber'];
  const contentNodes = node.elements.filter((el) => el.name === 'w:r' || referenceNodeTypes.includes(el.name));
  contentNodes.forEach((contentNode) => {
    const existingMarks = Array.isArray(contentNode.marks) ? contentNode.marks : [];
    const marksWithoutLink = existingMarks.filter((mark) => mark?.type !== 'link');
    contentNode.marks = [...marksWithoutLink, linkMark];
  });

  const updatedNode = nodeListHandler.handler({
    ...params,
    nodes: contentNodes,
    path: [...(params.path || []), node],
  });

  return updatedNode;
};

/**
 * Resolve the href from the relationship ID or anchor.
 * @param {Object} docx - The parsed DOCX object.
 * @param {import('@translator').EncodedAttributes} encodedAttrs - The encoded attributes containing rId or anchor.
 * @returns {string|undefined} The resolved href or undefined if not found.
 */
const _resolveHref = (docx, encodedAttrs, filename) => {
  const currentFile = filename || 'document.xml';
  let rels = docx?.[`word/_rels/${currentFile}.rels`];
  if (!rels) rels = docx?.['word/_rels/document.xml.rels'];
  const relationships = rels?.elements?.find((el) => el.name === 'Relationships');
  const elements = relationships?.elements || [];

  const { rId, anchor } = encodedAttrs;
  let href;
  if (!rId && anchor) {
    href = `#${anchor}`;
  } else if (rId) {
    const rel = elements.find((el) => el.attributes?.['Id'] === rId) || {};
    const { attributes: relAttributes = {} } = rel;
    href = relAttributes['Target'];
  }
  return href;
};

/**
 * Decode the hyperlink mark back into OOXML <w:hyperlink>.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params) {
  const { hyperlinkGroup = [params.node] } = params.extraParams || {};
  const node = hyperlinkGroup[0];

  const linkMark = node.marks.find((m) => m.type === 'link');
  const linkAttrs = this.decodeAttributes({ ...params, node: linkMark });
  let { href: link, anchor } = linkMark.attrs;

  if (!linkAttrs['r:id'] && !anchor) {
    linkAttrs['r:id'] = _addNewLinkRelationship(params, link);
  }

  let contentNodes = [];
  hyperlinkGroup.forEach((linkNode) => {
    if ('marks' in linkNode) {
      linkNode.marks = linkNode.marks.filter((m) => m.type !== 'link');
    } else {
      linkNode.attrs.marksAsAttrs = linkNode.attrs.marksAsAttrs.filter((m) => m.type !== 'link');
    }
    const outputNode = exportSchemaToJson({ ...params, node: linkNode });
    if (outputNode) {
      if (outputNode instanceof Array) contentNodes.push(...outputNode);
      else contentNodes.push(outputNode);
    }
  });

  const newNode = {
    name: 'w:hyperlink',
    type: 'element',
    attributes: {
      ...linkAttrs,
    },
    elements: contentNodes,
  };

  return newNode;
}

/**
 * If needed, create a new link relationship and add it to the relationships array
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @param {string} [link] The URL of this link
 * @returns {string} The new relationship ID
 */
function _addNewLinkRelationship(params, link) {
  let id = generateDocxRandomId();

  if (!params.relationships || !Array.isArray(params.relationships)) {
    params.relationships = [];
  }

  params.relationships.push({
    type: 'element',
    name: 'Relationship',
    attributes: {
      Id: `rId${id}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
      Target: link,
      TargetMode: 'External',
    },
  });
  return `rId${id}`;
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
 * The NodeTranslator instance for the passthrough element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
