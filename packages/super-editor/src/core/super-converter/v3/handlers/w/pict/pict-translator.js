import { NodeTranslator } from '../../../node-translator/node-translator';
import { pictNodeTypeStrategy } from './helpers/pict-node-type-strategy';
import { translateShapeContainer } from './helpers/translate-shape-container';
import { translateShapeTextbox } from './helpers/translate-shape-textbox';
import { translateContentBlock } from './helpers/translate-content-block';
import { translateImageWatermark } from './helpers/translate-image-watermark';
import { translateTextWatermark } from './helpers/translate-text-watermark';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:pict';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = ['shapeContainer', 'contentBlock', 'image'];

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = []; // No attrs for "w:pict".

/**
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
function encode({ nodes, ...params }) {
  const [node] = nodes;

  if (!node) {
    return undefined;
  }

  const { type: pictType, handler } = pictNodeTypeStrategy(node);

  if (!handler || pictType === 'unknown') {
    return undefined;
  }

  const result = handler({
    params,
    pict: node,
  });

  return result;
}

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params) {
  const { node } = params;
  if (!node || !node.type) {
    return null;
  }

  const types = {
    shapeContainer: () => translateShapeContainer(params),
    shapeTextbox: () => translateShapeTextbox(params),
    contentBlock: () => translateContentBlock(params),
    image: () => {
      // Handle VML watermarks
      // Regular images are handled by wp:anchor/wp:inline translators
      if (node.attrs?.vmlWatermark) {
        // Check if this is a text watermark (converted to SVG image on import)
        if (node.attrs?.vmlTextWatermark) {
          return translateTextWatermark(params);
        }
        // Otherwise it's an image watermark
        return translateImageWatermark(params);
      }
      return null;
    },
    default: () => null,
  };

  const decoder = types[node.type] ?? types.default;
  const result = decoder();
  if (result) {
    // Passthrough siblings are stored as an attribute (not content) because
    // image is a leaf node in the PM schema.
    const siblings = node.attrs?.passthroughSiblings;
    if (Array.isArray(siblings) && siblings.length > 0) {
      result.elements ??= [];
      result.elements.push(...siblings.map((xml) => carbonCopy(xml)));
    }
  }
  return result;
}

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
