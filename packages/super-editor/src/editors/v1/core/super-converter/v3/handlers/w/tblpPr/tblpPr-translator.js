import { NodeTranslator } from '@translator';
import { createAttributeHandler, parseInteger, integerToString } from '../../utils.js';

/**
 * The NodeTranslator instance for the tblpPr element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 442
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:tblpPr',
  sdNodeOrKeyName: 'floatingTableProperties',
  attributes: ['w:leftFromText', 'w:rightFromText', 'w:topFromText', 'w:bottomFromText', 'w:tblpX', 'w:tblpY']
    .map((attr) => createAttributeHandler(attr, null, parseInteger, integerToString))
    .concat(['w:horzAnchor', 'w:vertAnchor', 'w:tblpXSpec', 'w:tblpYSpec'].map((attr) => createAttributeHandler(attr))),
  encode: (params, encodedAttrs) => {
    void params;
    return Object.keys(encodedAttrs).length > 0 ? encodedAttrs : undefined;
  },
  decode: function ({ node }, context) {
    void context;
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs.floatingTableProperties || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
