import { handleImageNode } from '@converter/v3/handlers/wp/helpers/encode-image-node-helpers.js';

/**
 * Anchor image node handler
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {Object|null} Handler result
 */
export function handleAnchorNode(params) {
  const { node } = params.extraParams;

  if (node.name !== 'wp:anchor') {
    return null;
  }

  return handleImageNode(node, params, true);
}
