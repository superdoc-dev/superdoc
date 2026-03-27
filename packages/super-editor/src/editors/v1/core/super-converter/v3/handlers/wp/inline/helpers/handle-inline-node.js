import { handleImageNode } from '@converter/v3/handlers/wp/helpers/encode-image-node-helpers.js';

/**
 * Inline image node handler
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {Object|null} Handler result
 */
export function handleInlineNode(params) {
  const { node } = params.extraParams;

  if (node.name !== 'wp:inline') {
    return null;
  }

  return handleImageNode(node, params, false);
}
