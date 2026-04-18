import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:lang element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 285
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:lang',
  sdNodeOrKeyName: 'lang',
  attributes: [createAttributeHandler('w:val'), createAttributeHandler('w:eastAsia'), createAttributeHandler('w:bidi')],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['lang'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
