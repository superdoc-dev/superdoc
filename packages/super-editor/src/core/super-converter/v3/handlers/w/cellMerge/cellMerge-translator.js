import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:cellMerge element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:cellMerge',
  sdNodeOrKeyName: 'cellMerge',
  attributes: [createAttributeHandler('w:vMerge'), createAttributeHandler('w:vMergeOrig')],
  encode: (_, encodedAttrs) => {
    return Object.keys(encodedAttrs).length > 0 ? encodedAttrs : undefined;
  },
  decode: function ({ node }) {
    const decodedAttrs = this.decodeAttributes({
      node: { ...node, attrs: node.attrs?.cellMerge || {} },
    });
    return Object.keys(decodedAttrs).length > 0 ? { attributes: decodedAttrs } : undefined;
  },
});
