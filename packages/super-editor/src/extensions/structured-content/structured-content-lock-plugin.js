import { Plugin, PluginKey } from 'prosemirror-state';

export const STRUCTURED_CONTENT_LOCK_KEY = new PluginKey('structuredContentLock');

export function createStructuredContentLockPlugin() {
  return new Plugin({
    key: STRUCTURED_CONTENT_LOCK_KEY,

    filterTransaction(tr, state) {
      if (!tr.docChanged) return true;

      // Find all SDT-locked nodes in old state
      const lockedPositions = [];
      state.doc.descendants((node, pos) => {
        if (
          (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
          (node.attrs.lockMode === 'sdtLocked' || node.attrs.lockMode === 'sdtContentLocked')
        ) {
          lockedPositions.push({ pos, end: pos + node.nodeSize });
        }
      });

      if (lockedPositions.length === 0) return true;

      // Check if any locked node would be deleted
      for (const { pos, end } of lockedPositions) {
        const mappedPos = tr.mapping.mapResult(pos);
        const mappedEnd = tr.mapping.mapResult(end);
        if (mappedPos.deleted || mappedEnd.deleted) {
          return false; // Block transaction
        }
      }
      return true;
    },
  });
}
