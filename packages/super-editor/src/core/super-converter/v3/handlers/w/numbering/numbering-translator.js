import { NodeTranslator } from '@translator';
import { translator as wNsidTranslator } from '../../w/nsid';
import { translator as wTmplTranslator } from '../../w/tmpl';
import { translator as wNameTranslator } from '../../w/name';
import { translator as wStyleLinkTranslator } from '../../w/styleLink';
import { translator as wNumStyleLinkTranslator } from '../../w/numStyleLink';
import { translator as wMultiLevelTypeTranslator } from '../../w/multiLevelType';
import { translator as wAbstractNumTranslator } from '../../w/abstractNum';
import { translator as wNumTranslator } from '../../w/num';
import { translator as wNumIdMacAtCleanupTranslator } from '../../w/numIdMacAtCleanup';
import {
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
  wNumIdMacAtCleanupTranslator,
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
  xmlName: 'w:numbering',
  sdNodeOrKeyName: 'numbering',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [],
  encode: (params, encodedAttrs) => {
    const { nodes } = params;
    const node = nodes[0];

    const props = encodeProperties(params, propertyTranslatorsByXmlName);

    const result = {
      ...encodedAttrs,
      ...props,
      ...encodePropertiesByKey('w:abstractNum', 'abstracts', wAbstractNumTranslator, params, node, 'abstractNumId'),
      ...encodePropertiesByKey('w:num', 'definitions', wNumTranslator, params, node, 'numId'),
    };

    return result;
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['abstractNum'];
    if (!currentValue) {
      return undefined;
    }

    const decodedAttrs = this.decodeAttributes({ node: { ...params.node, attrs: currentValue } });

    const props = decodeProperties(params, propertyTranslatorsBySdName, currentValue);
    const elements = [
      ...props,
      ...decodePropertiesByKey('w:abstractNum', 'abstracts', wAbstractNumTranslator, params, currentValue),
      ...decodePropertiesByKey('w:num', 'definitions', wNumTranslator, params, currentValue),
    ];

    const newNode = {
      name: 'w:numbering',
      type: 'element',
      attributes: decodedAttrs,
      elements: elements,
    };

    return newNode;
  },
});
