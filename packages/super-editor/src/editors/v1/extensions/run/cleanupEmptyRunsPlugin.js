import { Plugin, TextSelection } from 'prosemirror-state';

/**
 * Plugin that removes empty run nodes inside paragraphs after transactions change the document.
 * Aggregates changed ranges from mapped steps to delete empty runs produced by edits or transforms.
 */
export const cleanupEmptyRunsPlugin = new Plugin({
  appendTransaction(trs, oldState, newState) {
    if (!trs.some((tr) => tr.docChanged)) return null;

    const { run, paragraph } = newState.schema.nodes;
    if (!run) return null;

    // Collect changed ranges in the new document
    const ranges = [];
    trs.forEach((tr) => {
      tr.mapping.maps.forEach((map) => {
        map.forEach((oldStart, oldEnd, newStart, newEnd) => {
          if (newStart !== oldStart || oldEnd !== newEnd) ranges.push({ from: newStart, to: newEnd });
        });
      });
    });

    if (!ranges.length) return null;

    // Merge overlaps, expand a little to catch neighbors
    ranges.sort((a, b) => a.from - b.from);
    const merged = [];
    for (const r of ranges) {
      const from = Math.max(0, r.from - 1);
      const to = Math.min(newState.doc.content.size, r.to + 1);
      const last = merged[merged.length - 1];
      if (last && from <= last.to) last.to = Math.max(last.to, to);
      else merged.push({ from, to });
    }

    const toDelete = [];
    merged.forEach(({ from, to }) => {
      newState.doc.nodesBetween(from, to, (node, pos, parent) => {
        if (node.type === run && node.content.size === 0 && parent?.type === paragraph) {
          toDelete.push({ from: pos, to: pos + node.nodeSize });
        }
      });
    });

    if (!toDelete.length) return null;
    const tr = newState.tr;
    // Delete from the end to keep positions stable
    toDelete.sort((a, b) => b.from - a.from).forEach(({ from, to }) => tr.deleteRange(from, to));
    if (tr.selection instanceof TextSelection && tr.selection.empty && newState.storedMarks !== null) {
      tr.setStoredMarks(newState.storedMarks);
    }
    return tr.docChanged ? tr : null;
  },
});
