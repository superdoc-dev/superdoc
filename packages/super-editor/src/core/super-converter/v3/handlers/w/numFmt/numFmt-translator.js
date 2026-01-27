import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:numFmt element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 208
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:numFmt',
  sdNodeOrKeyName: 'numFmt',
  attributes: [createAttributeHandler('w:val'), createAttributeHandler('w:format')],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['numFmt'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
