// @ts-check
import { NodeTranslator } from '@translator';
import {
  encodeRepeatedChildren,
  decodeRepeatedChildren,
  createBooleanAttributeHandler,
  createIntegerAttributeHandler,
} from '@converter/v3/handlers/utils.js';
import { translator as wLsdExceptionTranslator } from '../lsdException';

/**
 * The NodeTranslator instance for the w:latentStyles element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:latentStyles',
  sdNodeOrKeyName: 'latentStyles',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [
    createBooleanAttributeHandler('w:defLockedState'),
    createIntegerAttributeHandler('w:defUIPriority'),
    createBooleanAttributeHandler('w:defSemiHidden'),
    createBooleanAttributeHandler('w:defUnhideWhenUsed'),
    createBooleanAttributeHandler('w:defQFormat'),
    createIntegerAttributeHandler('w:count'),
  ],
  encode: (params, encodedAttrs) => {
    const { nodes } = params;
    const node = nodes[0];

    const lsdExceptions = encodeRepeatedChildren(
      'w:lsdException',
      'lsdExceptions',
      wLsdExceptionTranslator,
      params,
      node,
    );

    return { ...lsdExceptions, ...encodedAttrs };
  },
  decode: function (params) {
    // @ts-expect-error The decode function is bound to the NodeTranslator instance.
    const decodedAttrs = this.decodeAttributes({
      node: { ...params.node, attrs: params.node.attrs.latentStyles || {} },
    });
    const currentValue = params.node.attrs?.latentStyles;
    if (!currentValue) {
      return undefined;
    }

    const elements = decodeRepeatedChildren(
      'w:lsdException',
      'lsdExceptions',
      wLsdExceptionTranslator,
      params,
      currentValue,
    );

    return {
      name: 'w:latentStyles',
      attributes: decodedAttrs,
      elements,
    };
  },
});
