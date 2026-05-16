/**
 * Walk the doc collecting block-level tracked changes — PM nodes whose
 * `trackChange` attribute is set. Mirror of `getTrackChanges` (mark-based).
 *
 * Returned entries: `{ id, kind, operationId?, nodeType, from, to, node }`.
 *
 * @param {{ doc: import('prosemirror-model').Node } | import('prosemirror-state').EditorState | null | undefined} stateOrDoc
 * @returns {Array<{
 *   id: string,
 *   kind: 'insert' | 'delete',
 *   operationId?: string,
 *   nodeType: string,
 *   from: number,
 *   to: number,
 *   node: import('prosemirror-model').Node,
 * }>}
 */
export const getBlockTrackedChanges = (stateOrDoc) => {
  const doc = stateOrDoc?.doc ?? stateOrDoc;
  const out = [];
  if (!doc || typeof doc.descendants !== 'function') return out;
  doc.descendants((node, pos) => {
    const tc = node?.attrs?.trackChange;
    if (tc && tc.id && (tc.kind === 'insert' || tc.kind === 'delete')) {
      out.push({
        id: tc.id,
        kind: tc.kind,
        operationId: tc.operationId,
        nodeType: node.type.name,
        from: pos,
        to: pos + node.nodeSize,
        node,
      });
    }
  });
  return out;
};
