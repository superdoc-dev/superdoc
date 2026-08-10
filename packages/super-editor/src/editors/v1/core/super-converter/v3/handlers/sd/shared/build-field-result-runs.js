// @ts-check
import { exportSchemaToJson } from '../../../../exporter.js';
import { cloneXmlNode, getOrCreateRunProperties } from '../../w/r/helpers/helpers.js';

function applyRunPropertyElements(runNode, outputMarks) {
  if (!runNode || runNode.name !== 'w:r' || outputMarks.length === 0) return runNode;

  const runProperties = getOrCreateRunProperties(runNode);
  const outputMarkNames = new Set(outputMarks.map((mark) => mark?.name).filter(Boolean));
  runProperties.elements = runProperties.elements.filter((element) => !outputMarkNames.has(element?.name));
  runProperties.elements.push(...outputMarks.map(cloneXmlNode));
  return runNode;
}

function applyRunPropertiesToFieldResultNodes(nodes, outputMarks) {
  if (outputMarks.length === 0) return nodes;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.name === 'w:r') return applyRunPropertyElements(node, outputMarks);
    if (Array.isArray(node.elements)) node.elements = node.elements.map(walk);
    return node;
  };
  return nodes.map(walk);
}

function extractTextFromXmlNodes(nodes) {
  let text = '';
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string') text += node.text;
    if (Array.isArray(node.elements)) node.elements.forEach(walk);
  };
  nodes.forEach(walk);
  return text;
}

function buildResolvedTextRun(resolvedText, outputMarks) {
  const textAttributes = /^\s|\s$/.test(resolvedText) ? { 'xml:space': 'preserve' } : undefined;
  return [
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:t', attributes: textAttributes, elements: [{ text: resolvedText, type: 'text' }] },
      ],
    },
  ];
}

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @param {Array<unknown>} outputMarks
 * @returns {import('@translator').SCDecoderResult[]}
 */
export function buildFieldResultRuns(params, outputMarks) {
  const { node } = params;
  const contentNodes = (node.content ?? []).flatMap((child) => exportSchemaToJson({ ...params, node: child }));
  if (contentNodes.length > 0) return applyRunPropertiesToFieldResultNodes(contentNodes, outputMarks);

  const resolvedText = node.attrs?.resolvedText;
  const fieldResultContent = Array.isArray(node.attrs?.fieldResultContent) ? node.attrs.fieldResultContent : [];
  const fieldResultNodes = fieldResultContent.flatMap((child) => exportSchemaToJson({ ...params, node: child }));
  if (fieldResultNodes.length > 0) {
    const fieldResultText = extractTextFromXmlNodes(fieldResultNodes);
    if (typeof resolvedText !== 'string' || resolvedText.length === 0 || fieldResultText === resolvedText) {
      return applyRunPropertiesToFieldResultNodes(fieldResultNodes, outputMarks);
    }
  }

  if (typeof resolvedText !== 'string' || resolvedText.length === 0) return [];

  return buildResolvedTextRun(resolvedText, outputMarks);
}
