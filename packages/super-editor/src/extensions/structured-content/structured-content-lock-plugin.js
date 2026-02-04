import { Plugin, PluginKey } from 'prosemirror-state';

export const STRUCTURED_CONTENT_LOCK_KEY = new PluginKey('structuredContentLock');

/**
 * Collects the ranges affected by a transaction, based on the document BEFORE the change.
 * @param {import('prosemirror-state').Transaction} tr
 * @returns {Array<{ from: number, to: number }>}
 */
const collectChangedRanges = (tr) => {
  const ranges = [];
  tr.mapping.maps.forEach((map) => {
    map.forEach((oldStart, oldEnd) => {
      const from = Math.min(oldStart, oldEnd);
      const to = Math.max(oldStart, oldEnd);
      if (from !== to) {
        ranges.push({ from, to });
      }
    });
  });
  return ranges;
};

/**
 * Checks if a node is a locked SDT (sdtLocked or sdtContentLocked).
 * @param {import('prosemirror-model').Node} node
 * @returns {boolean}
 */
const isLockedSdt = (node) => {
  return (
    (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
    (node.attrs.lockMode === 'sdtLocked' || node.attrs.lockMode === 'sdtContentLocked')
  );
};

export function createStructuredContentLockPlugin() {
  return new Plugin({
    key: STRUCTURED_CONTENT_LOCK_KEY,

    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;

      // Get only the ranges affected by this transaction
      const changedRanges = collectChangedRanges(tr);
      if (changedRanges.length === 0) return true;

      // Check only nodes within the changed ranges for locked SDTs
      for (const { from, to } of changedRanges) {
        // Use nodesBetween to only traverse affected range
        let hasLockedNode = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (isLockedSdt(node)) {
            // Check if this locked node would be deleted
            const mappedPos = tr.mapping.mapResult(pos);
            const mappedEnd = tr.mapping.mapResult(pos + node.nodeSize);
            if (mappedPos.deleted || mappedEnd.deleted) {
              hasLockedNode = true;
              return false; // Stop traversal
            }
          }
        });
        if (hasLockedNode) return false; // Block transaction
      }

      return true;
    },
  });
}
