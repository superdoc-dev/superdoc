import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:color element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 267
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:color',
  sdNodeOrKeyName: 'color',
  attributes: [
    createAttributeHandler('w:val'),
    createAttributeHandler('w:themeColor'),
    createAttributeHandler('w:themeTint'),
    createAttributeHandler('w:themeShade'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['color'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
