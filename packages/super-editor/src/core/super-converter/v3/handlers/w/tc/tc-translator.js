import { NodeTranslator } from '../../../node-translator/node-translator';
import { handleTableCellNode } from './helpers/legacy-handle-table-cell-node';
import { translateTableCell } from './helpers/translate-table-cell';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:tc';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'tableCell';

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = [];

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
    rowBorders,
    baseTableBorders,
    tableLook,
    rowCnfStyle,
    columnIndex,
    columnWidth,
    columnWidths: allColumnWidths,
    rowIndex,
    totalRows,
    totalColumns,
    preferTableGridWidths,
    _referencedStyles,
  } = params.extraParams;

  const schemaNode = handleTableCellNode({
    params,
    node,
    table,
    row,
    tableProperties,
    rowBorders,
    baseTableBorders,
    tableLook,
    rowCnfStyle,
    columnIndex,
    columnWidth,
    allColumnWidths,
    rowIndex,
    totalRows,
    totalColumns,
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
  if (decodedAttrs && Object.keys(decodedAttrs).length) {
    translated.attributes = { ...(translated.attributes || {}), ...decodedAttrs };
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
