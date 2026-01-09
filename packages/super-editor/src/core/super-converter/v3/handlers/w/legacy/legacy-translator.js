import { NodeTranslator } from '@translator';
import { createIntegerAttributeHandler, createBooleanAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:legacy element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:legacy',
  sdNodeOrKeyName: 'legacy',
  attributes: [
    createBooleanAttributeHandler('w:legacy'),
    createIntegerAttributeHandler('w:legacySpace'),
    createIntegerAttributeHandler('w:legacyIndent'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['legacy'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
