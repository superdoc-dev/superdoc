import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateShapeContainer(params) {
  const { node } = params;
  const elements = translateChildNodes(params);

  const shape = {
    name: 'v:shape',
    attributes: {
      ...node.attrs.attributes,
      fillcolor: node.attrs.fillcolor,
    },
    elements: [
      ...elements,
      ...(node.attrs.wrapAttributes
        ? [
            {
              name: 'w10:wrap',
              attributes: { ...node.attrs.wrapAttributes },
            },
          ]
        : []),
    ],
  };

  const pict = {
    name: 'w:pict',
    attributes: {
      'w14:anchorId': generateRandomSigned32BitIntStrId(),
    },
    elements: [shape],
  };

  return pict;
}
