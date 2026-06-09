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

  // Patch geometry when the user resized the textbox (attrs.width/height are in px).
  // Two elements carry the size in EMU (1 px = 9525 EMU at 96 DPI):
  //   <wp:extent cx cy>  — anchor bounding box (child of wp:anchor)
  //   <a:ext cx cy>      — shape transform geometry (inside wps:spPr/a:xfrm)
  const { width: pxWidth, height: pxHeight } = node.attrs ?? {};
  if (pxWidth != null || pxHeight != null) {
    const emuCx = pxWidth != null ? String(Math.round(pxWidth * 9525)) : null;
    const emuCy = pxHeight != null ? String(Math.round(pxHeight * 9525)) : null;
    patchNodeAttributes(drawing, 'wp:extent', emuCx, emuCy);
    patchNodeAttributes(drawing, 'a:ext', emuCx, emuCy);
  }

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

// Patches cx/cy on the first element matching targetName found anywhere in the tree.
function patchNodeAttributes(node, targetName, cx, cy) {
  if (!node || typeof node !== 'object') return false;
  if (node.name === targetName && node.attributes) {
    if (cx != null) node.attributes.cx = cx;
    if (cy != null) node.attributes.cy = cy;
    return true;
  }
  if (!Array.isArray(node.elements)) return false;
  for (const child of node.elements) {
    if (patchNodeAttributes(child, targetName, cx, cy)) return true;
  }
  return false;
}
