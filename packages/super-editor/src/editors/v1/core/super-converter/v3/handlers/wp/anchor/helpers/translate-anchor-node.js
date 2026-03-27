import { translateImageNode } from '@converter/v3/handlers/wp/helpers/decode-image-node-helpers.js';
import { pixelsToEmu, objToPolygon } from '@converter/helpers.js';
import { mergeDrawingChildren } from '@converter/v3/handlers/wp/helpers/merge-drawing-children.js';
import { parseRelativeHeight } from '@converter/v3/handlers/wp/helpers/relative-height.js';

/**
 * Translates anchor image
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateAnchorNode(params) {
  const { attrs } = params.node;
  const anchorElements = [];
  const useOriginalChildren = Array.isArray(attrs.originalDrawingChildren) && attrs.originalDrawingChildren.length > 0;

  const hasSimplePos = attrs.simplePos !== undefined || attrs.originalAttributes?.simplePos !== undefined;

  if (!useOriginalChildren && hasSimplePos) {
    anchorElements.push({
      name: 'wp:simplePos',
      attributes: {
        x: attrs.simplePos?.x ?? 0,
        y: attrs.simplePos?.y ?? 0,
      },
    });
  }

  if (!useOriginalChildren && attrs.anchorData) {
    const hElements = [];
    if (attrs.marginOffset.horizontal !== undefined) {
      hElements.push({
        name: 'wp:posOffset',
        elements: [{ type: 'text', text: pixelsToEmu(attrs.marginOffset.horizontal).toString() }],
      });
    }
    if (attrs.anchorData.alignH) {
      hElements.push({
        name: 'wp:align',
        elements: [{ type: 'text', text: attrs.anchorData.alignH }],
      });
    }
    anchorElements.push({
      name: 'wp:positionH',
      attributes: { relativeFrom: attrs.anchorData.hRelativeFrom },
      ...(hElements.length && { elements: hElements }),
    });

    const vElements = [];
    if (attrs.marginOffset.top !== undefined) {
      vElements.push({
        name: 'wp:posOffset',
        elements: [{ type: 'text', text: pixelsToEmu(attrs.marginOffset.top).toString() }],
      });
    }
    if (attrs.anchorData.alignV) {
      vElements.push({
        name: 'wp:align',
        elements: [{ type: 'text', text: attrs.anchorData.alignV }],
      });
    }

    anchorElements.push({
      name: 'wp:positionV',
      attributes: { relativeFrom: attrs.anchorData.vRelativeFrom },
      ...(vElements.length && { elements: vElements }),
    });
  }

  const nodeElements = translateImageNode(params);

  // Guard: bail out if translateImageNode produced a non-drawing result (e.g. text fallback).
  if (!nodeElements?.elements?.some((el) => el?.name === 'wp:extent')) {
    return nodeElements;
  }

  const inlineAttrs = {
    ...(attrs.originalAttributes || {}),
    ...(nodeElements.attributes || {}),
  };

  // Prefer the live top-level relativeHeight (updated by images.setZOrder)
  // over the stale value in originalAttributes. Always serialize as unsignedInt.
  const liveRelativeHeight = parseRelativeHeight(attrs.relativeHeight);
  const originalRelativeHeight = parseRelativeHeight(inlineAttrs.relativeHeight);
  inlineAttrs.relativeHeight = liveRelativeHeight ?? originalRelativeHeight ?? 1;

  if (attrs.originalAttributes?.simplePos === undefined && hasSimplePos) {
    inlineAttrs.simplePos = '1';
  }

  const wrapElement = {
    name: `wp:wrap${attrs.wrap?.type || 'None'}`, // Important: wp:anchor will break if no wrapping is specified. We need to use wrapNone.
  };
  switch (useOriginalChildren ? undefined : attrs.wrap?.type) {
    case 'Square':
      wrapElement.attributes = {
        wrapText: attrs.wrap.attrs.wrapText,
      };
      if ('distBottom' in (attrs.wrap.attrs || {})) {
        wrapElement.attributes.distB = pixelsToEmu(attrs.wrap.attrs.distBottom);
      }
      if ('distLeft' in (attrs.wrap.attrs || {})) {
        wrapElement.attributes.distL = pixelsToEmu(attrs.wrap.attrs.distLeft);
      }
      if ('distRight' in (attrs.wrap.attrs || {})) {
        wrapElement.attributes.distR = pixelsToEmu(attrs.wrap.attrs.distRight);
      }
      if ('distTop' in (attrs.wrap.attrs || {})) {
        wrapElement.attributes.distT = pixelsToEmu(attrs.wrap.attrs.distTop);
      }
      break;
    case 'TopAndBottom': {
      const attributes = {};
      let hasKeys = false;
      if ('distBottom' in (attrs.wrap.attrs || {})) {
        attributes.distB = pixelsToEmu(attrs.wrap.attrs.distBottom);
        hasKeys = true;
      }
      if ('distTop' in (attrs.wrap.attrs || {})) {
        attributes.distT = pixelsToEmu(attrs.wrap.attrs.distTop);
        hasKeys = true;
      }
      if (hasKeys) {
        wrapElement.attributes = attributes;
      }
      break;
    }
    case 'Through':
    case 'Tight': {
      const attributes = {};
      if ('distLeft' in (attrs.wrap.attrs || {})) {
        attributes.distL = pixelsToEmu(attrs.wrap.attrs.distLeft);
      }
      if ('distRight' in (attrs.wrap.attrs || {})) {
        attributes.distR = pixelsToEmu(attrs.wrap.attrs.distRight);
      }
      if ('distTop' in (attrs.wrap.attrs || {})) {
        attributes.distT = pixelsToEmu(attrs.wrap.attrs.distTop);
      }
      if ('distBottom' in (attrs.wrap.attrs || {})) {
        attributes.distB = pixelsToEmu(attrs.wrap.attrs.distBottom);
      }
      const wrapText = attrs.wrap.attrs?.wrapText || 'bothSides';
      if (wrapText) {
        attributes.wrapText = wrapText;
      }
      if (Object.keys(attributes).length) {
        wrapElement.attributes = attributes;
      }

      // Add polygon if present
      if (attrs.wrap.attrs?.polygon) {
        const polygonNode = objToPolygon(attrs.wrap.attrs.polygon);
        if (polygonNode) {
          if (attrs.wrap.attrs?.polygonEdited !== undefined) {
            polygonNode.attributes = {
              ...(polygonNode.attributes || {}),
              edited: String(attrs.wrap.attrs.polygonEdited),
            };
          }
          wrapElement.elements = [polygonNode];
        }
      }
      break;
    }
    case 'None':
      inlineAttrs.behindDoc = attrs.wrap.attrs?.behindDoc ? '1' : '0';
      break;
    default:
      break;
  }

  const effectIndex = nodeElements.elements.findIndex((el) => el.name === 'wp:effectExtent');
  const elementsWithWrap = [
    ...nodeElements.elements.slice(0, effectIndex + 1),
    wrapElement,
    ...nodeElements.elements.slice(effectIndex + 1),
  ];

  const mergedElements = mergeDrawingChildren({
    order: attrs.drawingChildOrder || [],
    original: attrs.originalDrawingChildren || [],
    generated: [...anchorElements, ...elementsWithWrap],
  });

  return {
    name: 'wp:anchor',
    attributes: inlineAttrs,
    elements: mergedElements,
  };
}
