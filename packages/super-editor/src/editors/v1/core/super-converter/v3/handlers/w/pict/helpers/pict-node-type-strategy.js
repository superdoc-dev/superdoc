import { handleVRectImport } from './handle-v-rect-import';
import { handleShapeTextboxImport } from './handle-shape-textbox-import';
import { handleShapeImageWatermarkImport } from './handle-shape-image-watermark-import';
import { handleShapeTextWatermarkImport } from './handle-shape-text-watermark-import';

/**
 * @param {Object} node
 * @returns {Object}
 */
export function pictNodeTypeStrategy(node) {
  const shape = node.elements?.find((el) => el.name === 'v:shape');
  const group = node.elements?.find((el) => el.name === 'v:group');
  const rect = node.elements?.find((el) => el.name === 'v:rect');

  if (rect) {
    return { type: 'contentBlock', handler: handleVRectImport };
  }

  // such a case probably shouldn't exist.
  if (!shape && !group) {
    return { type: 'unknown', handler: null };
  }

  const isGroup = group && !shape;
  if (isGroup) {
    // there should be a group of shapes being processed here (skip for now).
    return { type: 'unknown', handler: null };
  } else {
    const textbox = shape.elements?.find((el) => el.name === 'v:textbox');
    if (textbox) {
      return { type: 'shapeContainer', handler: handleShapeTextboxImport };
    }

    // Check for v:textpath (text watermarks)
    // Note: Text watermarks are converted to SVG images during import
    // so they return type: 'image' but use the text watermark handler
    const textpath = shape.elements?.find((el) => el.name === 'v:textpath');
    if (textpath) {
      return { type: 'image', handler: handleShapeTextWatermarkImport };
    }

    // Check for v:imagedata (image watermarks)
    const imagedata = shape.elements?.find((el) => el.name === 'v:imagedata');
    if (imagedata) {
      return { type: 'image', handler: handleShapeImageWatermarkImport };
    }
  }

  return { type: 'unknown', handler: null };
}
