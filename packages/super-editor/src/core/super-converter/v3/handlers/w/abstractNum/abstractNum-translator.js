import { NodeTranslator } from '@translator';
import { translator as wNsidTranslator } from '../../w/nsid';
import { translator as wTmplTranslator } from '../../w/tmpl';
import { translator as wNameTranslator } from '../../w/name';
import { translator as wStyleLinkTranslator } from '../../w/styleLink';
import { translator as wNumStyleLinkTranslator } from '../../w/numStyleLink';
import { translator as wMultiLevelTypeTranslator } from '../../w/multiLevelType';
import { translator as wLvlTranslator } from '../../w/lvl';
import {
  createIntegerAttributeHandler,
  encodeProperties,
  decodeProperties,
  encodePropertiesByKey,
  decodePropertiesByKey,
} from '@converter/v3/handlers/utils.js';

const propertyTranslators = [
  wNsidTranslator,
  wTmplTranslator,
  wNameTranslator,
  wStyleLinkTranslator,
  wNumStyleLinkTranslator,
  wMultiLevelTypeTranslator,
];

const propertyTranslatorsByXmlName = {};
const propertyTranslatorsBySdName = {};
propertyTranslators.forEach((translator) => {
  propertyTranslatorsByXmlName[translator.xmlName] = translator;
  propertyTranslatorsBySdName[translator.sdNodeOrKeyName] = translator;
});

/**
 * The NodeTranslator instance for the w:num element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:abstractNum',
  sdNodeOrKeyName: 'abstractNum',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [createIntegerAttributeHandler('w:abstractNumId')],
  encode: (params, encodedAttrs) => {
    const { nodes } = params;
    const node = nodes[0];

    const result = {
      ...encodedAttrs,
      ...encodeProperties(params, propertyTranslatorsByXmlName),
      ...encodePropertiesByKey('w:lvl', 'levels', wLvlTranslator, params, node, 'ilvl'),
    };

    return result;
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['abstractNum'];
    if (!currentValue) {
      return undefined;
    }

    const decodedAttrs = this.decodeAttributes({ node: { ...params.node, attrs: currentValue } });

    const elements = [
      ...decodeProperties(params, propertyTranslatorsBySdName, currentValue),
      ...decodePropertiesByKey('w:lvl', 'levels', wLvlTranslator, params, currentValue),
    ];

    const newNode = {
      name: 'w:abstractNum',
      type: 'element',
      attributes: decodedAttrs,
      elements: elements,
    };

    return newNode;
  },
});
