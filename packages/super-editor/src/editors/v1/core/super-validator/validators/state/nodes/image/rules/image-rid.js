// @ts-check
import { findOrCreateRelationship } from '../../../../../../parts/adapters/relationships-mutation.js';

/**
 * @typedef {import('prosemirror-state').Transaction} Transaction
 * @typedef {import('../../../../../types.js').ValidatorLogger} ValidatorLogger
 * @typedef {import('../../../../../types.js').Editor} Editor
 * @typedef {import('../../../../../types.js').ElementInfo} ElementInfo
 */

/**
 * Ensure all image nodes have a valid rId attribute.
 * @param {ElementInfo[]} images
 * @param {Editor} editor
 * @param {Transaction} tr
 * @param {ValidatorLogger} logger
 * @returns {{ modified: boolean, results: string[] }}
 */
export function ensureValidImageRID(images, editor, tr, logger) {
  let modified = false;
  const results = [];

  images.forEach(({ node, pos }) => {
    const { rId, src } = node.attrs;
    if (!rId && src) {
      const newId = findOrCreateRelationship(editor, 'image-rid:ensureValidImageRID', {
        target: src,
        type: 'image',
      });

      if (newId) {
        logger.debug('Assigned rId for image:', newId, 'at pos:', pos);

        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          rId: newId,
        });

        results.push(`Added missing rId to image at pos ${pos}`);
        modified = true;
      }
    }
  });

  return { modified, results };
}
