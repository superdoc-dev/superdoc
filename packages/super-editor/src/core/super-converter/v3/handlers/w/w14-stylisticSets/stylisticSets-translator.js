import { NodeTranslator } from '@translator';
import { parseBoolean, parseInteger } from '../../utils.js';

const XML_NAME = 'w14:stylisticSets';
const SD_KEY = 'stylisticSets';
const STYLISTIC_SET_CHILD_XML_NAME = 'w14:ss';

function readAttr(attributes, key) {
  return attributes?.[`w14:${key}`] ?? attributes?.[`w:${key}`];
}

function encodeStylisticSet(node) {
  const id = parseInteger(readAttr(node?.attributes, 'id'));
  if (id == null) return undefined;

  const valRaw = readAttr(node?.attributes, 'val');
  const val = valRaw == null ? undefined : parseBoolean(valRaw);

  return {
    id,
    ...(val === undefined ? {} : { val }),
  };
}

export const translator = NodeTranslator.from({
  xmlName: XML_NAME,
  sdNodeOrKeyName: SD_KEY,
  encode: ({ nodes }) => {
    const stylisticSetsNode = nodes?.[0];
    const children = Array.isArray(stylisticSetsNode?.elements) ? stylisticSetsNode.elements : [];

    const encoded = children
      .filter((child) => child?.name === STYLISTIC_SET_CHILD_XML_NAME)
      .map(encodeStylisticSet)
      .filter(Boolean);

    return encoded.length > 0 ? encoded : undefined;
  },
  decode: ({ node }) => {
    const values = node?.attrs?.[SD_KEY];
    if (!Array.isArray(values) || values.length === 0) return undefined;

    const elements = values
      .filter((entry) => Number.isFinite(entry?.id))
      .map((entry) => {
        const attributes = {
          'w14:id': String(entry.id),
        };

        if (entry.val !== undefined) {
          attributes['w14:val'] = entry.val ? '1' : '0';
        }

        return {
          name: STYLISTIC_SET_CHILD_XML_NAME,
          attributes,
        };
      });

    if (elements.length === 0) return undefined;

    return {
      name: XML_NAME,
      attributes: {},
      elements,
    };
  },
});
