import { NodeTranslator } from '@translator';
import {
  createAttributeHandler,
  createBooleanAttributeHandler,
  encodeProperties,
  decodeProperties,
  encodePropertiesByKey,
  decodePropertiesByKey,
} from '@converter/v3/handlers/utils.js';
import { translator as wNameTranslator } from '../../w/name';
import { translator as wAliasesTranslator } from '../../w/aliases';
import { translator as wBasedOnTranslator } from '../../w/basedOn';
import { translator as wNextTranslator } from '../../w/next';
import { translator as wLinkTranslator } from '../../w/link';
import { translator as wAutoRedefineTranslator } from '../../w/autoRedefine';
import { translator as wHiddenTranslator } from '../../w/hidden';
import { translator as wSemiHiddenTranslator } from '../../w/semiHidden';
import { translator as wUnhideWhenUsedTranslator } from '../../w/unhideWhenUsed';
import { translator as wQFormatTranslator } from '../../w/qFormat';
import { translator as wLockedTranslator } from '../../w/locked';
import { translator as wPersonalTranslator } from '../../w/personal';
import { translator as wPersonalComposeTranslator } from '../../w/personalCompose';
import { translator as wPersonalReplyTranslator } from '../../w/personalReply';
import { translator as wUiPriorityTranslator } from '../../w/uiPriority';
import { translator as wRsidTranslator } from '../../w/rsid';
import { translator as wPPrTranslator } from '../../w/pPr';
import { translator as wRPrTranslator } from '../../w/rpr';
import { translator as wTblPrTranslator } from '../../w/tblPr';
import { translator as wTrPrTranslator } from '../../w/trPr';
import { translator as wTcPrTranslator } from '../../w/tcPr';
import { translator as wTblStylePrTranslator } from '../../w/tblStylePr';

// Property translators for w:style child elements
// Each translator handles a specific property
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  wNameTranslator,
  wAliasesTranslator,
  wBasedOnTranslator,
  wNextTranslator,
  wLinkTranslator,
  wAutoRedefineTranslator,
  wHiddenTranslator,
  wSemiHiddenTranslator,
  wUnhideWhenUsedTranslator,
  wQFormatTranslator,
  wLockedTranslator,
  wPersonalTranslator,
  wPersonalComposeTranslator,
  wPersonalReplyTranslator,
  wUiPriorityTranslator,
  wRsidTranslator,
  wPPrTranslator,
  wRPrTranslator,
  wTblPrTranslator,
  wTrPrTranslator,
  wTcPrTranslator,
  wTblStylePrTranslator,
];

const attributeHandlers = [
  createAttributeHandler('w:type'),
  createAttributeHandler('w:styleId'),
  createBooleanAttributeHandler('w:default'),
  createBooleanAttributeHandler('w:customStyle'),
];

const propertyTranslatorsByXmlName = {};
const propertyTranslatorsBySdName = {};
propertyTranslators.forEach((translator) => {
  if (!translator) return;
  propertyTranslatorsByXmlName[translator.xmlName] = translator;
  propertyTranslatorsBySdName[translator.sdNodeOrKeyName] = translator;
});

/**
 * The NodeTranslator instance for the w:style element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:style',
  sdNodeOrKeyName: 'style',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: attributeHandlers,
  encode: (params, encodedAttrs) => {
    const { nodes } = params;
    const node = nodes[0];

    const result = {
      ...encodedAttrs,
      ...encodeProperties(params, propertyTranslatorsByXmlName),
      ...encodePropertiesByKey(
        wTblStylePrTranslator.xmlName,
        'tableStyleProperties',
        wTblStylePrTranslator,
        params,
        node,
        'type',
      ),
    };

    return result;
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['style'];
    if (!currentValue) {
      return undefined;
    }

    const decodedAttrs = this.decodeAttributes({ node: { ...params.node, attrs: currentValue } });

    const elements = [
      ...decodeProperties(params, propertyTranslatorsBySdName, currentValue),
      ...decodePropertiesByKey(
        wTblStylePrTranslator.xmlName,
        'tableStyleProperties',
        wTblStylePrTranslator,
        params,
        currentValue,
      ),
    ];

    const newNode = {
      name: 'w:style',
      type: 'element',
      attributes: decodedAttrs,
      elements: elements,
    };

    return newNode;
  },
});
