import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateShapeTextbox(params) {
  const { node } = params;
  const elements = translateChildNodes(params);

  const textboxContent = {
    name: 'w:txbxContent',
    elements,
  };

  const textbox = {
    name: 'v:textbox',
    attributes: {
      ...node.attrs.attributes,
    },
    elements: [textboxContent],
  };

  return textbox;
}
