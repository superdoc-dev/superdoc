/**
 * Detect whether a ProseMirror transaction touches a structural row tracked
 * change (whole-table insert/delete encoded on `tableRow.attrs.trackChange`).
 *
 * Structural row revisions live on node attributes — NOT on inline marks — so
 * the inline `collectTouchedTrackedChangeIds` scan never reports them. When such
 * a node-attr change is part of a transaction, the right-rail structural bubble
 * sync must run a FULL resync (the targeted, id-based resync path only refreshes
 * inline mark bubbles). This helper flags those transactions so the caller can
 * force a full resync, mirroring how inline mark edits trigger sidebar refresh.
 *
 * Conservative by design: returns true if any node within a changed range is a
 * `tableRow` carrying a `rowInsert`/`rowDelete` `trackChange`. False positives
 * only cost an extra full resync; false negatives would silently drop the bubble.
 *
 * @param {import('prosemirror-state').Transaction} transaction
 * @returns {boolean}
 */
export function transactionTouchesStructuralChange(transaction) {
  if (!transaction?.docChanged || !transaction?.doc || !transaction?.mapping?.maps?.length) return false;

  const docSize = transaction.doc.content.size;
  let touched = false;

  transaction.mapping.maps.forEach((stepMap, stepIndex) => {
    if (touched) return;
    stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (touched) return;
      const mappingOffset = stepIndex + 1;
      const mappedFrom = transaction.mapping.slice(mappingOffset).map(newStart, 1);
      const mappedTo = transaction.mapping.slice(mappingOffset).map(newEnd, -1);
      const from = Math.max(0, mappedFrom - 1);
      const to = Math.min(docSize, mappedTo + 1);
      if (from >= to) return;

      transaction.doc.nodesBetween(from, to, (node) => {
        if (touched) return false;
        if (node?.type?.name !== 'tableRow') return undefined;
        const tc = node.attrs?.trackChange;
        if (tc && (tc.type === 'rowInsert' || tc.type === 'rowDelete')) {
          touched = true;
          return false;
        }
        return undefined;
      });
    });
  });

  return touched;
}
