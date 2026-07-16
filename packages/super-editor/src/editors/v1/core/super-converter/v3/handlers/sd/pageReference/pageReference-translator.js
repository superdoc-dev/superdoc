// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';
import { buildInstructionElements } from '../shared/index.js';
import { translator as wRPrTranslator } from '../../w/rpr/index.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:pageReference';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'pageReference';

/**
 * Encode a <sd:pageReference> node as a SuperDoc pageReference node.
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [], nodeListHandler } = params || {};
  const node = nodes[0];

  const processedText = nodeListHandler.handler({
    ...params,
    nodes: node.elements,
  });

  // const marks = parseMarks(rPr || { elements: [] });
  const processedNode = {
    type: 'pageReference',
    attrs: {
      instruction: node.attributes?.instruction || '',
      marksAsAttrs: node.marks || [],
      ...(node.attributes?.instructionTokens ? { instructionTokens: node.attributes.instructionTokens } : {}),
      ...(node.attributes?.bookmarkId ? { bookmarkId: node.attributes.bookmarkId } : {}),
      ...(node.attributes?.hasHyperlinkSwitch ? { hasHyperlinkSwitch: true } : {}),
      ...(node.attributes?.hasRelativePositionSwitch ? { hasRelativePositionSwitch: true } : {}),
      ...(node.attributes?.pageNumberFieldFormat
        ? { pageNumberFieldFormat: node.attributes.pageNumberFieldFormat }
        : {}),
      ...(node.attributes?.numericPictureFormat ? { numericPictureFormat: node.attributes.numericPictureFormat } : {}),
      ...(node.attributes?.fieldResultFormat ? { fieldResultFormat: node.attributes.fieldResultFormat } : {}),
      ...(node.attributes?.fieldRunProperties ? { fieldRunProperties: node.attributes.fieldRunProperties } : {}),
    },
    content: processedText,
  };

  return processedNode;
};

/**
 * Decode the lineBreak / hardBreak node back into OOXML <w:br>.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;

  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const contentNodes = (node.content ?? []).flatMap((n) => exportSchemaToJson({ ...params, node: n }));
  const instructionElements = buildInstructionElements(node.attrs?.instruction, node.attrs?.instructionTokens);
  const instructionRunProperties = resolveInstructionRunProperties(params, outputMarks);
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
      elements: [{ name: 'w:rPr', elements: instructionRunProperties }, ...instructionElements],
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
    ...contentNodes,
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

const resolveInstructionRunProperties = (params, outputMarks) => {
  const { node } = params;
  const fieldRunProperties = node.attrs?.fieldRunProperties;
  const shouldUseFieldRunProperties =
    node.attrs?.fieldResultFormat === 'charformat' &&
    fieldRunProperties &&
    typeof fieldRunProperties === 'object' &&
    !Array.isArray(fieldRunProperties) &&
    Object.keys(fieldRunProperties).length > 0;

  if (!shouldUseFieldRunProperties) {
    return outputMarks;
  }

  const fieldRunPropertiesNode = wRPrTranslator.decode({
    ...params,
    node: { attrs: { runProperties: fieldRunProperties } },
  });
  return Array.isArray(fieldRunPropertiesNode?.elements) ? fieldRunPropertiesNode.elements : outputMarks;
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
 * The NodeTranslator instance for the passthrough element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
