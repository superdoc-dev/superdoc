import { NodeTranslator } from '@translator';
import {
  createAttributeHandler,
  createIntegerAttributeHandler,
  createBooleanAttributeHandler,
} from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:framePr element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 208
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:framePr',
  sdNodeOrKeyName: 'framePr',
  attributes: [
    createBooleanAttributeHandler('w:anchorLock'),
    createAttributeHandler('w:dropCap'),
    createIntegerAttributeHandler('w:h'),
    createAttributeHandler('w:hAnchor'),
    createAttributeHandler('w:hRule'),
    createIntegerAttributeHandler('w:hSpace'),
    createIntegerAttributeHandler('w:lines'),
    createAttributeHandler('w:vAnchor'),
    createIntegerAttributeHandler('w:vSpace'),
    createIntegerAttributeHandler('w:w'),
    createAttributeHandler('w:wrap'),
    createIntegerAttributeHandler('w:x'),
    createAttributeHandler('w:xAlign'),
    createIntegerAttributeHandler('w:y'),
    createAttributeHandler('w:yAlign'),
  ],
  encode: (_, encodedAttrs) => {
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['framePr'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
