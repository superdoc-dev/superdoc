/**
 * Scans backward from `cursorPos` to `minPos` for the nearest text character
 * and returns the range needed to delete it.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} cursorPos - Position to start scanning backward from.
 * @param {number} minPos    - Earliest position to consider (e.g. paragraph start).
 * @returns {{ from: number, to: number } | null}
 */
export const findPreviousTextDeleteRange = (doc, cursorPos, minPos) => {
  for (let pos = cursorPos; pos >= minPos; pos -= 1) {
    const $probe = doc.resolve(pos);
    const nodeBefore = $probe.nodeBefore;
    if (!nodeBefore?.isText || !nodeBefore.text?.length) continue;
    return { from: pos - 1, to: pos };
  }
  return null;
};
