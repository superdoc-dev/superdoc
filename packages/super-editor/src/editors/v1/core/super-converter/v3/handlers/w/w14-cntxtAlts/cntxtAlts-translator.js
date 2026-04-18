import { NodeTranslator } from '@translator';
import { parseBoolean } from '../../utils.js';

const XML_NAME = 'w14:cntxtAlts';
const SD_KEY = 'contextualAlternates';

function readVal(node) {
  return node?.attributes?.['w14:val'] ?? node?.attributes?.['w:val'];
}

export const translator = NodeTranslator.from({
  xmlName: XML_NAME,
  sdNodeOrKeyName: SD_KEY,
  encode: ({ nodes }) => {
    const rawValue = readVal(nodes?.[0]);
    if (rawValue == null) return true;
    return parseBoolean(rawValue);
  },
  decode: ({ node }) => {
    const value = node?.attrs?.[SD_KEY];
    if (value == null) return undefined;
    if (value === true) return { attributes: {} };
    return {
      attributes: { 'w14:val': '0' },
    };
  },
});
