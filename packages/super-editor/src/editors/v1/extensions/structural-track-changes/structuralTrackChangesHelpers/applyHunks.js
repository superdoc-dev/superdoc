// @ts-check
import { Fragment } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {{
 *   kind: 'remove' | 'insert',
 *   changeId: string,
 *   basePos?: number,
 *   anchorBasePos?: number,
 *   proposalNode?: import('prosemirror-model').Node,
 * }} StructuralHunk
 */

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
 *   hunks: StructuralHunk[],
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
      if (typeof hunk.basePos !== 'number') {
        warnings.push(`Missing basePos for remove hunk ${hunk.changeId}`);
        continue;
      }
      const livePos = tr.mapping.map(hunk.basePos);
      const node = tr.doc.nodeAt(livePos);
      if (!node) {
        warnings.push(`No node at pos ${hunk.basePos} for remove hunk ${hunk.changeId}`);
        continue;
      }
      if (node.type.name === 'table') {
        // Tables delete per-row: PM's `tableRow+` content schema can't carry a
        // table-level trackChange, so every row gets the shared operationId.
        let rowPos = livePos + 1;
        for (let i = 0; i < node.childCount; i += 1) {
          const row = node.child(i);
          if (row.type.name === 'tableRow') {
            tr.setNodeMarkup(rowPos, null, {
              ...row.attrs,
              trackChange: { type: 'rowDelete', id: uuidv4(), operationId },
            });
          }
          rowPos += row.nodeSize;
        }
      } else {
        // Non-table block (paragraph, heading, …): stamp the block node itself
        // with the canonical `{ kind }` shape. Accept removes the whole node;
        // reject strips the attr (see acceptRejectRowTrackedChange).
        tr.setNodeMarkup(livePos, null, {
          ...node.attrs,
          trackChange: { kind: 'delete', id: uuidv4(), operationId },
        });
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
      if (typeof hunk.anchorBasePos !== 'number') {
        warnings.push(`Missing anchorBasePos for insert hunk ${hunk.changeId}`);
        continue;
      }
      let trackedNode;
      if (proposal.type.name === 'table') {
        // Tables premark every row (no table-level trackChange slot).
        const trackedRows = [];
        proposal.content.forEach((row) => {
          if (row.type.name !== 'tableRow') {
            trackedRows.push(row);
            return;
          }
          trackedRows.push(
            row.type.create(
              { ...row.attrs, trackChange: { type: 'rowInsert', id: uuidv4(), operationId } },
              row.content,
              row.marks,
            ),
          );
        });
        trackedNode = proposal.type.create(proposal.attrs, Fragment.fromArray(trackedRows), proposal.marks);
      } else {
        // Non-table block: stamp the block node itself.
        trackedNode = proposal.type.create(
          { ...proposal.attrs, trackChange: { kind: 'insert', id: uuidv4(), operationId } },
          proposal.content,
          proposal.marks,
        );
      }
      tr.insert(tr.mapping.map(hunk.anchorBasePos), trackedNode);
      applied += 1;
      continue;
    }

    warnings.push(`Unsupported hunk kind: ${hunk.kind}`);
  }

  return { applied, warnings };
};
