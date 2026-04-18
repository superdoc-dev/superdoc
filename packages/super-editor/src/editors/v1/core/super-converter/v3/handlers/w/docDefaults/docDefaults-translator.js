import { NodeTranslator } from '@translator';
import { translator as wPPrTranslator } from '../../w/pPr';
import { translator as wRPrTranslator } from '../../w/rpr';

/**
 * The NodeTranslator instance for the w:docDefaults element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:docDefaults',
  sdNodeOrKeyName: 'docDefaults',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: [],
  encode: (params) => {
    const { nodes } = params;
    const node = nodes[0];
    const result = {};

    [
      {
        wrapperName: 'w:rPrDefault',
        propertyName: 'runProperties',
        translator: wRPrTranslator,
      },
      {
        wrapperName: 'w:pPrDefault',
        propertyName: 'paragraphProperties',
        translator: wPPrTranslator,
      },
    ].forEach(({ wrapperName, propertyName, translator }) => {
      const defaultElement = node.elements?.find((el) => el.name === wrapperName);
      const propertyElement = defaultElement?.elements?.find((el) => el.name === wrapperName.replace('Default', ''));
      if (propertyElement) {
        const props = translator.encode({ ...params, nodes: [propertyElement] });
        if (props) {
          result[propertyName] = props;
        }
      }
    });

    return Object.keys(result).length > 0 ? result : undefined;
  },
  decode: function (params) {
    const currentValue = params.node.attrs?.['docDefaults'];
    if (!currentValue) {
      return undefined;
    }

    const elements = [];

    [
      {
        wrapperName: 'w:rPrDefault',
        propertyName: 'runProperties',
        translator: wRPrTranslator,
      },
      {
        wrapperName: 'w:pPrDefault',
        propertyName: 'paragraphProperties',
        translator: wPPrTranslator,
      },
    ].forEach(({ wrapperName, propertyName, translator }) => {
      const propertyValue = currentValue[propertyName];
      if (propertyValue) {
        const decodedProperty = translator.decode({ ...params, node: { attrs: { [propertyName]: propertyValue } } });
        if (decodedProperty) {
          elements.push({
            name: wrapperName,
            type: 'element',
            elements: [decodedProperty],
          });
        }
      }
    });

    if (elements.length === 0) {
      return undefined;
    }

    const newNode = {
      name: 'w:docDefaults',
      type: 'element',
      attributes: {},
      elements: elements,
    };

    return newNode;
  },
});
