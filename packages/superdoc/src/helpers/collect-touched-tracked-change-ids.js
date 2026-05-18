/**
 * Collect tracked-change mark IDs from ranges touched by a ProseMirror transaction.
 *
 * @param {import('prosemirror-state').Transaction} transaction
 * @param {object} [options]
 * @param {object|null} [options.trackChangesPluginKey] - The TrackChangesBasePluginKey to read metadata from
 * @returns {Set<string>} Set of tracked-change mark IDs
 */
export function collectTouchedTrackedChangeIds(transaction, { trackChangesPluginKey = null } = {}) {
  const ids = new Set();
  const addMarkId = (mark) => {
    const id = mark?.attrs?.id;
    if (id != null) ids.add(String(id));
  };

  // AIDEV-NOTE: Existing tracked-change edits can update the live mark text
  // without reporting that mark in TrackChangesBasePluginKey metadata. Keep
  // the changed-range scan so the sidebar bubble refreshes for those edits.
  const meta = trackChangesPluginKey ? transaction?.getMeta?.(trackChangesPluginKey) : null;
  if (meta) {
    [meta.insertedMark, meta.deletionMark, meta.formatMark].forEach(addMarkId);
  }

  if (!transaction?.docChanged || !transaction?.doc || !transaction?.mapping?.maps?.length) return ids;

  // Map each step's output range through all subsequent steps to get coordinates
  // valid in transaction.doc (the final document). Individual step maps report
  // newStart/newEnd relative to intermediate documents, not the final doc —
  // using them directly causes wrong lookups in multi-step transactions
  // (e.g. IME/composition, paste, batched edits).
  const docSize = transaction.doc.content.size;
  transaction.mapping.maps.forEach((stepMap, stepIndex) => {
    stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
      const mappingOffset = stepIndex + 1;
      const mappedFrom = transaction.mapping.slice(mappingOffset).map(newStart, 1);
      const mappedTo = transaction.mapping.slice(mappingOffset).map(newEnd, -1);
      const from = Math.max(0, mappedFrom - 1);
      const to = Math.min(docSize, mappedTo + 1);
      if (from >= to) return;

      transaction.doc.nodesBetween(from, to, (node) => {
        node.marks?.forEach((mark) => {
          const markName = mark.type?.name;
          if (markName === 'trackInsert' || markName === 'trackDelete' || markName === 'trackFormat') addMarkId(mark);
        });
      });
    });
  });

  return ids;
}
