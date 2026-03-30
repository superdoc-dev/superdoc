import { NodeTranslator } from '@translator';
import {
  createAttributeHandler,
  createIntegerAttributeHandler,
  createBooleanAttributeHandler,
} from '@converter/v3/handlers/utils.js';

/**
 * The NodeTranslator instance for the w:lsdException element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:lsdException',
  sdNodeOrKeyName: 'lsdException',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [
    createAttributeHandler('w:name'),
    createBooleanAttributeHandler('w:locked'),
    createBooleanAttributeHandler('w:qFormat'),
    createBooleanAttributeHandler('w:semiHidden'),
    createBooleanAttributeHandler('w:unhideWhenUsed'),
    createIntegerAttributeHandler('w:uiPriority'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['lsdException'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { name: 'w:lsdException', attributes: decodedAttrs } : undefined;
  },
});
