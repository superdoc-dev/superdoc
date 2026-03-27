import { NodeTranslator } from '@translator';
import { createIntegerAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:fitText element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 279
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:fitText',
  sdNodeOrKeyName: 'fitText',
  attributes: [createIntegerAttributeHandler('w:val'), createIntegerAttributeHandler('w:id')],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['fitText'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
