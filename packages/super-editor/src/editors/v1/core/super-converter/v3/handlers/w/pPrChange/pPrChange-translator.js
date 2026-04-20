import { NodeTranslator } from '@translator';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { createNestedPropertiesTranslator, createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { basePropertyTranslators } from '../pPr/pPr-base-translators.js';

const pPrTranslator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:pPr', 'paragraphProperties', basePropertyTranslators),
);

const ATTRIBUTE_HANDLERS = [
  createAttributeHandler('w:id'),
  createAttributeHandler('w:author'),
  createAttributeHandler('w:date'),
];

function getSectPr(pPrNode) {
  const sectPr = pPrNode?.elements?.find((el) => el.name === 'w:sectPr');
  return sectPr ? carbonCopy(sectPr) : undefined;
}

/**
 * The NodeTranslator instance for the w:pPrChange element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:pPrChange',
  sdNodeOrKeyName: 'change',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: ATTRIBUTE_HANDLERS,
  encode: (params, encodedAttrs = {}) => {
    const changeNode = params.nodes[0];
    const pPrNode = changeNode?.elements?.find((el) => el.name === 'w:pPr');

    let paragraphProperties = pPrNode ? (pPrTranslator.encode({ ...params, nodes: [pPrNode] }) ?? {}) : undefined;
    const sectPr = getSectPr(pPrNode);
    if (sectPr) {
      paragraphProperties = {
        ...(paragraphProperties || {}),
        sectPr,
      };
    }

    const result = {
      ...encodedAttrs,
      ...(paragraphProperties ? { paragraphProperties } : {}),
    };

    return Object.keys(result).length ? result : undefined;
  },
  decode: function (params) {
    const change = params.node?.attrs?.change;
    if (!change || typeof change !== 'object') return undefined;

    const decodedAttrs = this.decodeAttributes({
      node: { ...params.node, attrs: change },
    });
    const hasParagraphProperties = Object.prototype.hasOwnProperty.call(change, 'paragraphProperties');
    const paragraphProperties = hasParagraphProperties ? change.paragraphProperties : undefined;

    let pPrNode =
      paragraphProperties && typeof paragraphProperties === 'object'
        ? pPrTranslator.decode({
            ...params,
            node: { ...params.node, attrs: { paragraphProperties } },
          })
        : undefined;

    const sectPr = paragraphProperties?.sectPr ? carbonCopy(paragraphProperties.sectPr) : undefined;
    if (sectPr) {
      if (!pPrNode) {
        pPrNode = {
          name: 'w:pPr',
          type: 'element',
          attributes: {},
          elements: [],
        };
      }
      pPrNode.elements = [...(pPrNode.elements || []), sectPr];
    }

    if (!pPrNode && hasParagraphProperties) {
      pPrNode = {
        name: 'w:pPr',
        type: 'element',
        attributes: {},
        elements: [],
      };
    }

    if (!pPrNode && !Object.keys(decodedAttrs).length) return undefined;

    return {
      name: 'w:pPrChange',
      type: 'element',
      attributes: decodedAttrs,
      elements: pPrNode ? [pPrNode] : [],
    };
  },
});
