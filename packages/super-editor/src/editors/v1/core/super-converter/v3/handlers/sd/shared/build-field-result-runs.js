// @ts-check
import { exportSchemaToJson } from '../../../../exporter.js';

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @param {Array<unknown>} outputMarks
 * @returns {import('@translator').SCDecoderResult[]}
 */
export function buildFieldResultRuns(params, outputMarks) {
  const { node } = params;
  const contentNodes = (node.content ?? []).flatMap((child) => exportSchemaToJson({ ...params, node: child }));
  if (contentNodes.length > 0) return contentNodes;

  const resolvedText = node.attrs?.resolvedText;
  if (typeof resolvedText !== 'string' || resolvedText.length === 0) return [];

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
