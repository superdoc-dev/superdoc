import { NodeTranslator } from '@translator';
import {
  createIntegerAttributeHandler,
  createBooleanAttributeHandler,
  createAttributeHandler,
} from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:eastAsianLayout element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 273
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:eastAsianLayout',
  sdNodeOrKeyName: 'eastAsianLayout',
  attributes: [
    createIntegerAttributeHandler('w:id'),
    createBooleanAttributeHandler('w:combine'),
    createAttributeHandler('w:combineBrackets'),
    createBooleanAttributeHandler('w:vert'),
    createBooleanAttributeHandler('w:vertCompress'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['eastAsianLayout'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
