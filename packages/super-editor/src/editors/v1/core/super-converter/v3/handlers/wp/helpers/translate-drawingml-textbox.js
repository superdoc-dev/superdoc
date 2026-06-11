import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { wrapTextInRun } from '@converter/exporter.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';

export function translateDrawingMLTextbox(params) {
  const { node } = params;
  const drawingContent = node?.attrs?.drawingContent;
  const shapeTextbox = node?.content?.find((child) => child?.type === 'shapeTextbox');

  if (!drawingContent || !shapeTextbox) {
    return null;
  }

  const drawing = carbonCopy(drawingContent);
  const liveParagraphs = translateChildNodes({
    ...params,
    node: shapeTextbox,
  });

  const txbxContent = findTextboxContentNode(drawing);
  if (!txbxContent) {
    return null;
  }

  txbxContent.elements = liveParagraphs;

  const alternateContent = {
    name: 'mc:AlternateContent',
    elements: [
      {
        name: 'mc:Choice',
        attributes: { Requires: 'wps' },
        elements: [drawing],
      },
    ],
  };

  return wrapTextInRun(alternateContent);
}

function findTextboxContentNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.name === 'w:txbxContent') return node;
  if (!Array.isArray(node.elements)) return null;

  for (const child of node.elements) {
    const found = findTextboxContentNode(child);
    if (found) return found;
  }

  return null;
}
