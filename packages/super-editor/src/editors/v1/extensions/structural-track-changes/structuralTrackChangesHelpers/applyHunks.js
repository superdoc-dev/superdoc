import { Fragment } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';

/**
 * Apply structural hunks to a transaction as row-level tracked-change PM attrs.
 *
 * For each hunk:
 *   remove → walk to each row of the existing table at basePos,
 *            setNodeMarkup with trackChange.delete (one shared operationId).
 *   insert → reconstruct the proposal table with every row pre-marked
 *            trackChange.insert (one shared operationId), insert at
 *            anchorBasePos.
 *
 * Sets inputType meta so the trackedTransaction interceptor's existing
 * notAllowedMeta short-circuit skips this transaction (the rows already
 * carry block-level metadata; inline wrapping would double-track).
 *
 * @param {{
 *   tr: import('prosemirror-state').Transaction,
 *   state: import('prosemirror-state').EditorState,
 *   hunks: object[],
 * }} args
 * @returns {{ applied: number, warnings: string[] }}
 */
export const applyHunks = ({ tr, state, hunks }) => {
  const warnings = [];
  let applied = 0;
  tr.setMeta('inputType', 'acceptReject');

  for (const hunk of hunks) {
    if (!hunk || !hunk.changeId) continue;
    const operationId = hunk.changeId;

    if (hunk.kind === 'remove') {
      const livePos = tr.mapping.map(hunk.basePos);
      const tableNode = tr.doc.nodeAt(livePos);
      if (!tableNode || tableNode.type.name !== 'table') {
        warnings.push(`No table at pos ${hunk.basePos} for remove hunk ${hunk.changeId}`);
        continue;
      }
      let rowPos = livePos + 1;
      for (let i = 0; i < tableNode.childCount; i += 1) {
        const row = tableNode.child(i);
        if (row.type.name === 'tableRow') {
          tr.setNodeMarkup(rowPos, null, {
            ...row.attrs,
            trackChange: { kind: 'delete', id: uuidv4(), operationId },
          });
        }
        rowPos += row.nodeSize;
      }
      applied += 1;
      continue;
    }

    if (hunk.kind === 'insert') {
      const proposal = hunk.proposalNode;
      if (!proposal) {
        warnings.push(`Missing proposalNode for insert hunk ${hunk.changeId}`);
        continue;
      }
      const trackedRows = [];
      proposal.content.forEach((row) => {
        if (row.type.name !== 'tableRow') {
          trackedRows.push(row);
          return;
        }
        trackedRows.push(
          row.type.create(
            { ...row.attrs, trackChange: { kind: 'insert', id: uuidv4(), operationId } },
            row.content,
            row.marks,
          ),
        );
      });
      const trackedTable = proposal.type.create(proposal.attrs, Fragment.fromArray(trackedRows), proposal.marks);
      tr.insert(tr.mapping.map(hunk.anchorBasePos), trackedTable);
      applied += 1;
      continue;
    }

    warnings.push(`Unsupported hunk kind: ${hunk.kind}`);
  }

  return { applied, warnings };
};
