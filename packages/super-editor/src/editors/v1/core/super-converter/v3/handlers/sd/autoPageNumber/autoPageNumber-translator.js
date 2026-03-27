// @ts-check
import { NodeTranslator } from '@translator';
import { processOutputMarks } from '../../../../exporter.js';
import { parseMarks } from './../../../../v2/importer/markImporter.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:autoPageNumber';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'page-number';

/**
 * Encode a <sd:autoPageNumber> node as a SuperDoc page-number node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [] } = params || {};
  const node = nodes[0];

  const rPr = node.elements?.find((el) => el.name === 'w:rPr');
  const marks = parseMarks(rPr || { elements: [] });
  const processedNode = {
    type: 'page-number',
    attrs: {
      marksAsAttrs: marks,
    },
  };

  return processedNode;
};

/**
 * Decode the page-number node back into OOXML <w:fldChar> structure.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;

  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const translated = [
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:fldChar',
          attributes: {
            'w:fldCharType': 'begin',
          },
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:instrText',
          attributes: { 'xml:space': 'preserve' },
          elements: [
            {
              type: 'text',
              text: ' PAGE',
            },
          ],
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:fldChar',
          attributes: {
            'w:fldCharType': 'separate',
          },
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        {
          name: 'w:rPr',
          elements: outputMarks,
        },
        {
          name: 'w:fldChar',
          attributes: {
            'w:fldCharType': 'end',
          },
        },
      ],
    },
  ];

  return translated;
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
};

/**
 * The NodeTranslator instance.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
