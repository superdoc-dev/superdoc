import { NodeTranslator } from '@translator';
import {
  createAttributeHandler,
  createIntegerAttributeHandler,
  createBooleanAttributeHandler,
} from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:framePr element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 246
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:spacing',
  sdNodeOrKeyName: 'spacing',
  attributes: [
    createIntegerAttributeHandler('w:after'),
    createBooleanAttributeHandler('w:afterAutospacing'),
    createIntegerAttributeHandler('w:afterLines'),
    createIntegerAttributeHandler('w:before'),
    createBooleanAttributeHandler('w:beforeAutospacing'),
    createIntegerAttributeHandler('w:beforeLines'),
    createIntegerAttributeHandler('w:line'),
    createAttributeHandler('w:lineRule'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['spacing'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
