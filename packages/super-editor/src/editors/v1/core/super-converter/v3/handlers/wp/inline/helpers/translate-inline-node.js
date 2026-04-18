import { translateImageNode } from '@converter/v3/handlers/wp/helpers/decode-image-node-helpers.js';
import { mergeDrawingChildren } from '@converter/v3/handlers/wp/helpers/merge-drawing-children.js';

/**
 * Translates inline image
 * @param {Object} params - The parameters for translation.
 * @returns {Object} The XML representation.
 */
export function translateInlineNode(params) {
  const { attrs } = params.node;
  const nodeElements = translateImageNode(params);

  // Guard: bail out if translateImageNode produced a non-drawing result (e.g. text fallback).
  if (!nodeElements?.elements?.some((el) => el?.name === 'wp:extent')) {
    return nodeElements;
  }

  const inlineAttrs = {
    ...(attrs.originalAttributes || {}),
    ...(nodeElements.attributes || {}),
  };

  const generatedElements = nodeElements?.elements || [];
  const mergedElements = mergeDrawingChildren({
    order: params.node?.attrs?.drawingChildOrder || [],
    original: params.node?.attrs?.originalDrawingChildren || [],
    generated: generatedElements,
  });

  return {
    name: 'wp:inline',
    attributes: inlineAttrs,
    elements: mergedElements,
  };
}
