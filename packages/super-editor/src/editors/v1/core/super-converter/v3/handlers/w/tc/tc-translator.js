import { NodeTranslator } from '../../../node-translator/node-translator';
import { createAttributeHandler, stripUnsupportedTableIdentityAttributes } from '@converter/v3/handlers/utils.js';
import { handleTableCellNode } from './helpers/legacy-handle-table-cell-node';
import { translateTableCell } from './helpers/translate-table-cell';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:tc';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'tableCell';

/**
 * Legacy cell identity attributes imported from older SuperDoc exports.
 *
 * WordprocessingML does not define `w14:paraId` / `w14:textId` on `<w:tc>`.
 * We continue importing them for backwards compatibility, but decode strips
 * them so newly exported DOCX files stay schema-valid.
 *
 * @type {import('@translator').AttrConfig[]}
 */
const validXmlAttributes = ['w14:paraId', 'w14:textId'].map((xmlName) => createAttributeHandler(xmlName));

/**
 * @param {import('@translator').SCEncoderConfig} params
 * @param {import('@translator').EncodedAttributes} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
function encode(params, encodedAttrs) {
  const {
    node,
    table,
    row,
    tableProperties,
    columnIndex,
    columnWidth,
    columnWidths: allColumnWidths,
    preferTableGridWidths,
    _referencedStyles,
  } = params.extraParams;

  const schemaNode = handleTableCellNode({
    params,
    node,
    table,
    row,
    tableProperties,
    columnIndex,
    columnWidth,
    allColumnWidths,
    preferTableGridWidths,
    _referencedStyles,
  });

  if (encodedAttrs && Object.keys(encodedAttrs).length) {
    schemaNode.attrs = { ...schemaNode.attrs, ...encodedAttrs };
  }

  return schemaNode;
}

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs]
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params, decodedAttrs) {
  const translated = translateTableCell(params);
  const filteredDecodedAttrs = stripUnsupportedTableIdentityAttributes(decodedAttrs);
  if (Object.keys(filteredDecodedAttrs).length) {
    translated.attributes = { ...(translated.attributes || {}), ...filteredDecodedAttrs };
  }
  return translated;
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
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
