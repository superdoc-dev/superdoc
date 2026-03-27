import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:shd element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 416
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:shd',
  sdNodeOrKeyName: 'shading',
  attributes: [
    'w:color',
    'w:fill',
    'w:themeColor',
    'w:themeFill',
    'w:themeFillShade',
    'w:themeFillTint',
    'w:themeShade',
    'w:themeTint',
    'w:val',
  ].map((attr) => createAttributeHandler(attr)),
  encode: (params, encodedAttrs) => {
    void params;
    return Object.keys(encodedAttrs).length > 0 ? encodedAttrs : undefined;
  },
  decode: function ({ node }, context) {
    void context;
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs.shading || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
