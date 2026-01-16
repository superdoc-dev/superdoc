import { NodeTranslator } from '@translator';
import { translator as wAbstractNumIdTranslator } from '../../w/abstractNumId';
import { translator as wLvlOverrideTranslator } from '../../w/lvlOverride';
import {
  createIntegerAttributeHandler,
  encodeProperties,
  decodeProperties,
  encodePropertiesByKey,
  decodePropertiesByKey,
} from '@converter/v3/handlers/utils.js';

/**
 * The NodeTranslator instance for the w:num element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:num',
  sdNodeOrKeyName: 'num',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [createIntegerAttributeHandler('w:numId')],
  encode: (params, encodedAttrs) => {
    const { nodes } = params;
    const node = nodes[0];
    const result = {
      ...encodedAttrs,
      ...encodeProperties(params, {
        'w:abstractNumId': wAbstractNumIdTranslator,
      }),
      ...encodePropertiesByKey('w:lvlOverride', 'lvlOverrides', wLvlOverrideTranslator, params, node, 'ilvl'),
    };

    return result;
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['num'];
    if (!currentValue) {
      return undefined;
    }

    const decodedAttrs = this.decodeAttributes({ node: { ...params.node, attrs: currentValue } });

    const elements = [
      ...decodeProperties(
        params,
        {
          abstractNumId: wAbstractNumIdTranslator,
        },
        currentValue,
      ),
      ...decodePropertiesByKey('w:lvlOverride', 'lvlOverrides', wLvlOverrideTranslator, params, currentValue),
    ];

    const newNode = {
      name: 'w:num',
      type: 'element',
      attributes: decodedAttrs,
      elements: elements,
    };

    return newNode;
  },
});
