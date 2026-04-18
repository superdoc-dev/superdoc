import { NodeTranslator } from '@translator';
import { createIntegerAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:ind element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 219
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:ind',
  sdNodeOrKeyName: 'indent',
  attributes: [
    createIntegerAttributeHandler('w:end'),
    createIntegerAttributeHandler('w:endChars'),
    createIntegerAttributeHandler('w:firstLine'),
    createIntegerAttributeHandler('w:firstLineChars'),
    createIntegerAttributeHandler('w:hanging'),
    createIntegerAttributeHandler('w:hangingChars'),
    createIntegerAttributeHandler('w:left'),
    createIntegerAttributeHandler('w:leftChars'),
    createIntegerAttributeHandler('w:right'),
    createIntegerAttributeHandler('w:rightChars'),
    createIntegerAttributeHandler('w:start'),
    createIntegerAttributeHandler('w:startChars'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['indent'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
