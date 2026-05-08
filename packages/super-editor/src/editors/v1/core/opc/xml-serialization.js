/**
 * Serialize an xml-js non-compact JS tree to a string for OPC package files
 * (e.g. word/_rels/document.xml.rels, _rels/.rels, [Content_Types].xml).
 *
 * xml-js's `js2xml` does not re-encode XML entities in attribute values: a
 * `&amp;` decoded by `xml2js` would round-trip back as a bare `&`, producing
 * malformed XML. Word rejects malformed `*.rels` with an "unreadable content"
 * repair prompt and applies default formatting during repair, which manifests
 * as font, table-width, and spacing regressions. See SD-2888.
 *
 * This helper is the single serialization path for OPC metadata. Always use
 * it instead of calling `xmljs.js2xml` directly on parsed OPC XML.
 *
 * @module opc/xml-serialization
 */

import * as xmljs from 'xml-js';

// xml-js calls `attributeValueFn` with the attribute value AFTER it has already
// pre-escaped `"` to `&quot;`. We must escape `&`, `<`, and `>` without
// double-escaping the `&` of that pre-existing `&quot;` token.
const QUOT_PLACEHOLDER = 'SD_OPC_QUOT';
const QUOT_PLACEHOLDER_REGEX = /SD_OPC_QUOT/g;

/**
 * Escape characters that have special meaning inside an XML attribute value.
 *
 * @param {string} value - the attribute value as passed by xml-js (may already contain `&quot;`)
 * @returns {string}
 */
function escapeAttributeValue(value) {
  return String(value)
    .replace(/&quot;/g, QUOT_PLACEHOLDER)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(QUOT_PLACEHOLDER_REGEX, '&quot;');
}

/**
 * Serialize an xml-js non-compact JS object to an XML string with attribute
 * values correctly XML-encoded.
 *
 * @param {object} jsObject - xml-js non-compact tree (from `xml2js({ compact: false })`)
 * @returns {string}
 */
export function serializeOpcXml(jsObject) {
  return xmljs.js2xml(jsObject, { spaces: 0, attributeValueFn: escapeAttributeValue });
}
