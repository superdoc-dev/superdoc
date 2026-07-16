import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { wrapTextInRun } from '@converter/exporter.js';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { pixelsToEmu } from '@converter/helpers.js';

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
  const { width: pxWidth, height: pxHeight, marginOffset } = node.attrs ?? {};
  if (pxWidth != null || pxHeight != null) {
    const emuCx = pxWidth != null ? String(pixelsToEmu(pxWidth)) : null;
    const emuCy = pxHeight != null ? String(pixelsToEmu(pxHeight)) : null;
    patchNodeAttributes(drawing, 'wp:extent', emuCx, emuCy);
    patchShapeGeometryExt(drawing, emuCx, emuCy);
  }

  // Patch position when the user moved the textbox (marginOffset.horizontal/top are in px).
  // wp:positionH > wp:posOffset and wp:positionV > wp:posOffset carry the offset in EMU.
  if (marginOffset?.horizontal != null) {
    patchPositionOffset(drawing, 'wp:positionH', String(pixelsToEmu(marginOffset.horizontal)));
  }
  if (marginOffset?.top != null) {
    patchPositionOffset(drawing, 'wp:positionV', String(pixelsToEmu(marginOffset.top)));
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

// Patches the text content of wp:posOffset inside the first posNodeName element found in the tree.
// Only patches when wp:posOffset already exists (i.e. the shape uses absolute, not align, positioning).
function patchPositionOffset(node, posNodeName, emuValue) {
  if (!node || typeof node !== 'object') return false;
  if (node.name === posNodeName && Array.isArray(node.elements)) {
    const offsetEl = node.elements.find((el) => el.name === 'wp:posOffset');
    if (offsetEl && Array.isArray(offsetEl.elements) && offsetEl.elements.length > 0) {
      offsetEl.elements[0].text = emuValue;
      return true;
    }
    return false;
  }
  if (!Array.isArray(node.elements)) return false;
  for (const child of node.elements) {
    if (patchPositionOffset(child, posNodeName, emuValue)) return true;
  }
  return false;
}

// Navigates directly to wps:spPr > a:xfrm > a:ext to patch cx/cy.
// Avoids DFS first-match hitting a:ext elements in extension lists (which carry a uri attribute, not cx/cy).
function patchShapeGeometryExt(root, cx, cy) {
  const PATH = ['wp:anchor', 'a:graphic', 'a:graphicData', 'wps:wsp', 'wps:spPr', 'a:xfrm', 'a:ext'];
  let node = root;
  for (const name of PATH) {
    if (!node || !Array.isArray(node.elements)) return false;
    node = node.elements.find((el) => el.name === name) ?? null;
    if (!node) return false;
  }
  if (!node.attributes) node.attributes = {};
  if (cx != null) node.attributes.cx = cx;
  if (cy != null) node.attributes.cy = cy;
  return true;
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
