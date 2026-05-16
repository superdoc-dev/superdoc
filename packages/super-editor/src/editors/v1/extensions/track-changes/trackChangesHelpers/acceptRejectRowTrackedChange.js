import { getBlockTrackedChanges } from './getBlockTrackedChanges.js';

/**
 * Apply accept or reject to one or more row-level tracked changes by id.
 *
 * Resolution rules:
 *   insert + accept → strip attr (row stays in the doc)
 *   insert + reject → delete the row
 *   delete + accept → delete the row
 *   delete + reject → strip attr (row stays in the doc)
 *
 * If a deletion leaves the parent table with zero rows, the parent table is
 * also removed (matches OOXML / Google Docs row-delete semantics).
 *
 * Steps are appended to the provided transaction in descending position order
 * so deletions don't invalidate earlier positions in the same batch.
 *
 * @param {{
 *   tr: import('prosemirror-state').Transaction,
 *   state: import('prosemirror-state').EditorState,
 *   ids: string[],
 *   decision: 'accept' | 'reject',
 * }} args
 * @returns {{ applied: number, notFound: string[] }}
 */
export const applyRowTrackedChangeResolution = ({ tr, state, ids, decision }) => {
  const all = getBlockTrackedChanges(state);
  const wanted = new Set(ids);
  const entries = all.filter((e) => wanted.has(e.id));
  const foundIds = new Set(entries.map((e) => e.id));
  const notFound = ids.filter((id) => !foundIds.has(id));
  if (!entries.length) return { applied: 0, notFound };

  // Descending position order so earlier deletions don't invalidate later
  // positions within this single transaction.
  const sorted = [...entries].sort((a, b) => b.from - a.from);

  let applied = 0;
  for (const entry of sorted) {
    const stripAttr =
      (entry.kind === 'insert' && decision === 'accept') || (entry.kind === 'delete' && decision === 'reject');

    const livePos = tr.mapping.map(entry.from);
    const liveNode = tr.doc.nodeAt(livePos);
    if (!liveNode || liveNode.type.name !== entry.nodeType) continue;

    if (stripAttr) {
      tr.setNodeMarkup(livePos, null, { ...liveNode.attrs, trackChange: null });
      applied += 1;
      continue;
    }

    // Delete the row. If it's the only row in its parent table, delete the
    // table too (PM's tableRow+ content schema would otherwise reject an
    // empty table).
    const $pos = tr.doc.resolve(livePos);
    const parent = $pos.node($pos.depth);
    const parentPos = $pos.before($pos.depth);
    const isLastRowInTable = parent.type.name === 'table' && parent.childCount === 1;

    if (isLastRowInTable) {
      tr.delete(parentPos, parentPos + parent.nodeSize);
    } else {
      tr.delete(livePos, livePos + liveNode.nodeSize);
    }
    applied += 1;
  }

  return { applied, notFound };
};
