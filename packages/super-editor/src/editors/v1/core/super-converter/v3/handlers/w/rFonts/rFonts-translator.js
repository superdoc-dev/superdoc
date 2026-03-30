import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:rFonts element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 291
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:rFonts',
  sdNodeOrKeyName: 'fontFamily',
  attributes: [
    createAttributeHandler('w:hint'),
    createAttributeHandler('w:ascii'),
    createAttributeHandler('w:hAnsi'),
    createAttributeHandler('w:eastAsia'),
    createAttributeHandler('w:cs'),
    createAttributeHandler('w:val'),
    createAttributeHandler('w:asciiTheme'),
    createAttributeHandler('w:hAnsiTheme'),
    createAttributeHandler('w:eastAsiaTheme'),
    createAttributeHandler('w:cstheme'),
  ],
  encode: (params, encodedAttrs) => {
    if (params.inlineDocumentFonts) {
      // Right now we only support 'w:ascii'
      const font = encodedAttrs['ascii'];
      if (font) {
        if (!params.inlineDocumentFonts.includes(font)) {
          params.inlineDocumentFonts.push(font);
        }
      }
    }
    return encodedAttrs;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({ node: { ...node, attrs: node.attrs['fontFamily'] || {} } });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
