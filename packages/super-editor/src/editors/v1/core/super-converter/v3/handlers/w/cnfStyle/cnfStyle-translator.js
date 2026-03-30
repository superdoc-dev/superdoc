import { NodeTranslator } from '@translator';
import { booleanToString, createAttributeHandler, parseBoolean } from '@converter/v3/handlers/utils.js';

/**
 * The NodeTranslator instance for the cnfStyle element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 379
 *
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:cnfStyle',
  sdNodeOrKeyName: 'cnfStyle',
  attributes: [
    'w:evenHBand',
    'w:evenVBand',
    'w:firstColumn',
    'w:firstRow',
    'w:firstRowFirstColumn',
    'w:firstRowLastColumn',
    'w:lastColumn',
    'w:lastRow',
    'w:lastRowFirstColumn',
    'w:lastRowLastColumn',
    'w:oddHBand',
    'w:oddVBand',
  ]
    .map((attr) => createAttributeHandler(attr, null, parseBoolean, booleanToString))
    .concat([createAttributeHandler('w:val')]),
  encode: (_, encodedAttrs) => {
    return Object.keys(encodedAttrs).length > 0 ? encodedAttrs : undefined;
  },
  decode: function ({ node }) {
    if (!node.attrs?.cnfStyle) return;
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs.cnfStyle || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
