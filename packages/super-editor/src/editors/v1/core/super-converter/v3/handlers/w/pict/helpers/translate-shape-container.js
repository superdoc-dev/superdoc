import { translateChildNodes } from '@converter/v2/exporter/helpers/translateChildNodes';
import { generateRandomSigned32BitIntStrId } from '@helpers/generateDocxRandomId';
import { wrapTextInRun } from '@converter/exporter';
import { parseInlineStyles } from './parse-inline-styles';
import { translateDrawingMLTextbox } from '../../../wp/helpers/translate-drawingml-textbox.js';

/**
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateShapeContainer(params) {
  const { node } = params;

  if (node?.attrs?.drawingContent) {
    const run = translateDrawingMLTextbox(params);
    if (run) {
      return {
        name: 'w:p',
        elements: [run],
      };
    }
    // w:txbxContent not found in blob — replay the original drawing unchanged
    // to preserve the shape rather than silently dropping it.
    return {
      name: 'w:p',
      elements: [wrapTextInRun(node.attrs.drawingContent)],
    };
  }
  const elements = translateChildNodes(params);
  const shapeAttributes = {
    ...node.attrs.attributes,
    fillcolor: node.attrs.fillcolor,
  };
  const style = buildShapeStyle(node.attrs);

  if (style) {
    shapeAttributes.style = style;
  }

  const shape = {
    name: 'v:shape',
    attributes: shapeAttributes,
    elements: [
      ...elements,
      ...(node.attrs.wrapAttributes
        ? [
            {
              name: 'w10:wrap',
              attributes: { ...node.attrs.wrapAttributes },
            },
          ]
        : []),
    ],
  };

  const pict = {
    name: 'w:pict',
    attributes: {
      'w14:anchorId': generateRandomSigned32BitIntStrId(),
    },
    elements: [shape],
  };

  // shapeContainer is a block node exported at body level — w:pict must be
  // wrapped in w:p > w:r to produce valid OOXML.
  return {
    name: 'w:p',
    elements: [wrapTextInRun(pict)],
  };
}

/**
 * @param {Object} attrs
 * @returns {string|undefined}
 */
function buildShapeStyle(attrs) {
  const originalStyle = parseInlineStyles(attrs.attributes?.style);
  const managedStyle = parseInlineStyles(attrs.style);

  const style = {
    ...originalStyle,
    ...managedStyle,
  };

  if (attrs.marginOffset?.horizontal !== undefined) {
    style['margin-left'] = `${convertToPt(attrs.marginOffset.horizontal)}pt`;
  }

  if (attrs.marginOffset?.top !== undefined) {
    style['margin-top'] = `${convertToPt(attrs.marginOffset.top)}pt`;
  }

  if (attrs.anchorData?.alignH) {
    style['mso-position-horizontal'] = attrs.anchorData.alignH;
  }

  if (attrs.anchorData?.hRelativeFrom) {
    style['mso-position-horizontal-relative'] = attrs.anchorData.hRelativeFrom;
  }

  if (attrs.anchorData?.alignV) {
    style['mso-position-vertical'] = attrs.anchorData.alignV;
  }

  if (attrs.anchorData?.vRelativeFrom) {
    style['mso-position-vertical-relative'] = attrs.anchorData.vRelativeFrom;
  }

  const entries = Object.entries(style);
  if (entries.length === 0) return undefined;

  return entries.map(([prop, value]) => `${prop}:${value}`).join(';');
}

/**
 * @param {number} pixels
 * @returns {number}
 */
function convertToPt(pixels) {
  return (pixels * 72) / 96;
}
