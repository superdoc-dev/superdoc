import { NodeTranslator } from '@translator';
import { translator as wDocDefaultsTranslator } from '../../w/docDefaults';
import { translator as wLatentStylesTranslator } from '../../w/latentStyles';
import { translator as wStyleTranslator } from '../../w/style';
import {
  createAttributeHandler,
  encodeProperties,
  decodeProperties,
  encodeRepeatedChildren,
  decodeRepeatedChildren,
} from '@converter/v3/handlers/utils.js';

/**
 * The NodeTranslator instance for the w:styles element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:styles',
  sdNodeOrKeyName: 'styles',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [createAttributeHandler('mc:Ignorable')],
  encode: (params, encodedAttrs) => {
    const { nodes } = params;
    const node = nodes[0];

    const props = encodeProperties(params, {
      'w:docDefaults': wDocDefaultsTranslator,
      'w:latentStyles': wLatentStylesTranslator,
    });

    return {
      ...encodedAttrs,
      ...props,
      ...encodeRepeatedChildren('w:style', 'styles', wStyleTranslator, params, node),
    };
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['styles'];
    if (!currentValue) {
      return undefined;
    }

    const decodedAttrs = this.decodeAttributes({ node: { ...params.node, attrs: currentValue } });

    const props = decodeProperties(
      params,
      {
        docDefaults: wDocDefaultsTranslator,
        latentStyles: wLatentStylesTranslator,
      },
      currentValue,
    );

    const elements = [...props, ...decodeRepeatedChildren('w:style', 'styles', wStyleTranslator, params, currentValue)];

    return {
      name: 'w:styles',
      type: 'element',
      attributes: decodedAttrs,
      elements,
    };
  },
});
