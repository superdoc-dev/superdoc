import { NodeTranslator } from '@translator';
import { translator as wDocDefaultsTranslator } from '../../w/docDefaults';
import { translator as wLatentStylesTranslator } from '../../w/latentStyles';
import { translator as wStyleTranslator } from '../../w/style';
import {
  encodeProperties,
  decodeProperties,
  encodePropertiesByKey,
  decodePropertiesByKey,
} from '@converter/v3/handlers/utils.js';

/**
 * The NodeTranslator instance for the w:styles element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:styles',
  sdNodeOrKeyName: 'styles',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [],
  encode: (params) => {
    const { nodes } = params;
    const node = nodes[0];

    const props = encodeProperties(params, {
      'w:docDefaults': wDocDefaultsTranslator,
      'w:latentStyles': wLatentStylesTranslator,
    });
    const result = {
      ...props,
      ...encodePropertiesByKey('w:style', 'styles', wStyleTranslator, params, node, 'styleId'),
    };

    return result;
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['styles'];
    if (!currentValue) {
      return undefined;
    }

    const props = decodeProperties(
      params,
      {
        docDefaults: wDocDefaultsTranslator,
        latentStyles: wLatentStylesTranslator,
      },
      currentValue,
    );
    const elements = [...props, ...decodePropertiesByKey('w:style', 'styles', wStyleTranslator, params, currentValue)];
    const newNode = {
      name: 'w:styles',
      type: 'element',
      attributes: {},
      elements: elements,
    };

    return newNode;
  },
});
