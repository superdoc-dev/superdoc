/**
 * Room-level overwrite helpers for SuperDoc collaboration upgrade.
 *
 * These operate on SuperDoc-level Yjs state (comments, lock metadata)
 * that lives outside the editor's domain. Editor-level seeding is
 * handled by `seedEditorStateToYDoc` in super-editor.
 */

import { Map as YMap } from 'yjs';

/**
 * Overwrite the room's comment array with the current local comments.
 *
 * Performs an authoritative replacement — all existing room comments
 * are removed and replaced with serialized local state.
 *
 * @param {import('yjs').Doc} ydoc The target Yjs document
 * @param {Array} commentsList The local comments list (items with `getValues()`)
 * @returns {void}
 */
export function overwriteRoomComments(ydoc, commentsList) {
  const commentsArray = ydoc.getArray('comments');
  const locals = commentsList ?? [];

  ydoc.transact(() => {
    // Clear existing room comments
    if (commentsArray.length > 0) {
      commentsArray.delete(0, commentsArray.length);
    }

    // Serialize and insert local comments
    const serialized = locals
      .map((c) => (typeof c.getValues === 'function' ? c.getValues() : c))
      .filter(Boolean)
      .map((values) => new YMap(Object.entries(values)));

    if (serialized.length > 0) {
      commentsArray.push(serialized);
    }
  });
}

/**
 * Transfer the local lock state into the target room's meta map.
 *
 * @param {import('yjs').Doc} ydoc The target Yjs document
 * @param {{ isLocked: boolean, lockedBy: Object | null }} lockState
 * @returns {void}
 */
export function overwriteRoomLockState(ydoc, { isLocked, lockedBy }) {
  const metaMap = ydoc.getMap('meta');

  ydoc.transact(() => {
    if (isLocked) {
      metaMap.set('locked', true);
      metaMap.set('lockedBy', lockedBy);
    } else {
      metaMap.delete('locked');
      metaMap.delete('lockedBy');
    }
  });
}
