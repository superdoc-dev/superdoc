import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';

export const createTrackChangeRunPropertyTranslator = (xmlName, sdNodeOrKeyName) =>
  NodeTranslator.from({
    xmlName,
    sdNodeOrKeyName,
    attributes: [
      createAttributeHandler('w:id', 'id'),
      createAttributeHandler('w:author', 'author'),
      createAttributeHandler('w:authorEmail', 'authorEmail'),
      createAttributeHandler('w:date', 'date'),
    ],
    encode: (_params, encodedAttrs = {}) => {
      return Object.keys(encodedAttrs).length ? encodedAttrs : undefined;
    },
    decode: function ({ node }) {
      const source = node?.attrs?.[sdNodeOrKeyName];
      if (!source || typeof source !== 'object') {
        return undefined;
      }
      const decodedAttrs = this.decodeAttributes({
        node: {
          ...node,
          attrs: source,
        },
      });
      return Object.keys(decodedAttrs).length ? { attributes: decodedAttrs } : undefined;
    },
  });

export const trackInsertRunPropertyTranslator = createTrackChangeRunPropertyTranslator('w:ins', 'trackInsert');
export const trackDeleteRunPropertyTranslator = createTrackChangeRunPropertyTranslator('w:del', 'trackDelete');
