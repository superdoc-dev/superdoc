import { NodeTranslator } from '@translator';

const XML_NAME = 'w14:numForm';
const SD_KEY = 'numForm';

function readVal(node) {
  return node?.attributes?.['w14:val'] ?? node?.attributes?.['w:val'];
}

export const translator = NodeTranslator.from({
  xmlName: XML_NAME,
  sdNodeOrKeyName: SD_KEY,
  encode: ({ nodes }) => {
    return readVal(nodes?.[0]) ?? undefined;
  },
  decode: ({ node }) => {
    const value = node?.attrs?.[SD_KEY];
    if (value == null) return undefined;
    return {
      attributes: { 'w14:val': String(value) },
    };
  },
});
