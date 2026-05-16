/**
 * Compute structural hunks describing whole-block add/removes between two docs.
 *
 * Walks both docs at depth 1, matches blocks by `identityKey` (default:
 * `sdBlockId`). For each base block absent from proposal: emit
 * `{ kind: 'remove' }`. For each proposal block (of allowed type) absent from
 * base: emit `{ kind: 'insert' }`.
 *
 * Identity matching is intentionally simple. AI integrations whose proposal
 * docx has different `sdBlockId`s across imports can provide a structural
 * fingerprint via `opts.identityKey`.
 *
 * @param {import('prosemirror-model').Node} baseDoc
 * @param {import('prosemirror-model').Node} proposalDoc
 * @param {{ blockTypes?: readonly string[], identityKey?: (n: any) => string | null }} [opts]
 * @returns {Array<{
 *   kind: 'remove' | 'insert',
 *   changeId: string,
 *   basePos?: number,
 *   baseNodeSize?: number,
 *   proposalNode?: import('prosemirror-model').Node,
 *   anchorBasePos?: number,
 * }>}
 */
const DEFAULT_BLOCK_TYPES = Object.freeze(['table']);
const defaultIdentityKey = (node) => node?.attrs?.sdBlockId ?? null;

export const computeStructuralDiff = (baseDoc, proposalDoc, opts = {}) => {
  const blockTypes = opts.blockTypes ?? DEFAULT_BLOCK_TYPES;
  const identityKey = opts.identityKey ?? defaultIdentityKey;
  const blockTypeSet = new Set(blockTypes);

  const collectTopLevel = (doc) => {
    const entries = [];
    doc.forEach((node, offset) => {
      const id = identityKey(node);
      if (id != null) entries.push({ id, node, pos: offset, end: offset + node.nodeSize });
    });
    return entries;
  };

  const baseEntries = collectTopLevel(baseDoc);
  const proposalEntries = collectTopLevel(proposalDoc);
  const baseById = new Map(baseEntries.map((e) => [e.id, e]));
  const proposalIds = new Set(proposalEntries.map((e) => e.id));

  const hunks = [];

  for (const entry of baseEntries) {
    if (!proposalIds.has(entry.id) && blockTypeSet.has(entry.node.type.name)) {
      hunks.push({
        kind: 'remove',
        changeId: entry.id,
        basePos: entry.pos,
        baseNodeSize: entry.node.nodeSize,
      });
    }
  }

  let lastSharedBaseEnd = null;
  for (const entry of proposalEntries) {
    const sharedInBase = baseById.get(entry.id);
    if (sharedInBase) {
      lastSharedBaseEnd = sharedInBase.end;
      continue;
    }
    if (!blockTypeSet.has(entry.node.type.name)) continue;
    hunks.push({
      kind: 'insert',
      changeId: entry.id,
      proposalNode: entry.node,
      anchorBasePos: lastSharedBaseEnd ?? 0,
    });
  }

  return hunks;
};
