// @ts-check
import { stampTableRows } from '../../track-changes/trackChangesHelpers/stampTableRows.js';

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
 * Apply structural diff hunks to a transaction as upstream-native row-level
 * tracked changes.
 *
 * For each hunk:
 *   remove → stamp the existing table at `basePos` with `rowDelete` (the
 *            content stays visible, struck-through, until accept/reject).
 *   insert → insert the proposal table at `anchorBasePos`, then stamp it with
 *            `rowInsert`.
 *
 * Delegates to `stampTableRows()` so every row of a tracked table carries the
 * same attribute shape that the OOXML importer/exporter, the row-change
 * enumerator, the review graph, and the decision engine already understand
 * (`{ type: 'rowInsert' | 'rowDelete', id, author, authorId, authorEmail,
 * authorImage, date, revisionGroupId }`). One `revisionGroupId` per table.
 *
 * Tables only. Paragraph-level structural revisions use a different OOXML
 * primitive (`w:rPr/w:ins`) and would belong in a separate change.
 *
 * @param {{
 *   tr: import('prosemirror-state').Transaction,
 *   state: import('prosemirror-state').EditorState,
 *   user: import('../../../core/types/EditorConfig.js').User,
 *   date: string,
 *   hunks: StructuralHunk[],
 * }} args
 * @returns {{ applied: number, warnings: string[] }}
 */
 
export const applyHunks = ({ tr, state, user, date, hunks }) => {
  /** @type {string[]} */
  const warnings = [];
  let applied = 0;

  for (const hunk of hunks) {
    if (!hunk || !hunk.changeId) continue;

    if (hunk.kind === 'remove') {
      if (typeof hunk.basePos !== 'number') {
        warnings.push(`Missing basePos for remove hunk ${hunk.changeId}`);
        continue;
      }
      const livePos = tr.mapping.map(hunk.basePos);
      const node = tr.doc.nodeAt(livePos);
      if (!node || node.type.name !== 'table') {
        warnings.push(`Expected a table at pos ${hunk.basePos} for remove hunk ${hunk.changeId}`);
        continue;
      }
      if (stampTableRows({ type: 'rowDelete', tr, from: livePos, to: livePos + node.nodeSize, user, date })) {
        applied += 1;
      }
      continue;
    }

    if (hunk.kind === 'insert') {
      if (!hunk.proposalNode) {
        warnings.push(`Missing proposalNode for insert hunk ${hunk.changeId}`);
        continue;
      }
      if (typeof hunk.anchorBasePos !== 'number') {
        warnings.push(`Missing anchorBasePos for insert hunk ${hunk.changeId}`);
        continue;
      }
      if (hunk.proposalNode.type.name !== 'table') {
        warnings.push(`Only table inserts are supported (hunk ${hunk.changeId})`);
        continue;
      }
      const livePos = tr.mapping.map(hunk.anchorBasePos);
      const insertedSize = hunk.proposalNode.nodeSize;
      tr.insert(livePos, hunk.proposalNode);
      if (stampTableRows({ type: 'rowInsert', tr, from: livePos, to: livePos + insertedSize, user, date })) {
        applied += 1;
      }
      continue;
    }

    warnings.push(`Unsupported hunk kind: ${hunk.kind}`);
  }

  return { applied, warnings };
};
