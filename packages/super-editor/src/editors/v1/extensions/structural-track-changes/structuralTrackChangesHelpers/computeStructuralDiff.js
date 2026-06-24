// @ts-check
/**
 * Compute structural hunks describing whole-block add/removes between two docs.
 *
 * Walks both docs at depth 1, matches blocks by `identityKey` (default: a
 * content fingerprint built from the block's normalized `textContent` and
 * node type). For each base block absent from proposal: emit
 * `{ kind: 'remove' }`. For each proposal block (of allowed type) absent from
 * base: emit `{ kind: 'insert' }`.
 *
 * Why content fingerprint instead of sdBlockId: the docx importer assigns a
 * fresh sdBlockId on every load — there's no standard OOXML attribute for
 * tables to persist a stable id. So two independently-loaded copies of the
 * same document have different ids; matching by id would flag every block
 * as changed. Content fingerprinting matches identical blocks across
 * imports.
 *
 * Limitations of the default fingerprint:
 * - Two truly-identical blocks (e.g. empty placeholder tables) share a
 *   fingerprint; the algorithm treats them as one. Pass a custom
 *   `identityKey` if your domain has identical blocks that must be
 *   distinguished.
 * - A block whose content changed (same structure, different text) is
 *   treated as a remove of the old + insert of the new — visually rendered
 *   as "old red + new green." Consumers wanting "table modified in-place"
 *   semantics should pass a structural fingerprint (e.g., row count).
 *
 * Consumers whose proposal is a true in-place edit (sdBlockIds preserved
 * across base/proposal) can opt back into id-based matching:
 *   computeStructuralDiff(base, proposal, {
 *     identityKey: (n) => n.attrs?.sdBlockId ?? null,
 *   })
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
const defaultIdentityKey = (node) => {
  if (!node) return null;
  const typeName = node.type?.name ?? 'node';
  const text = typeof node.textContent === 'string' ? node.textContent : '';
  return `${typeName}:${text.replace(/\s+/g, ' ').trim()}`;
};

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
  const baseIds = new Set(baseEntries.map((e) => e.id));
  const proposalIds = new Set(proposalEntries.map((e) => e.id));

  const hunks = [];
  const emitRemove = (entry) => {
    if (blockTypeSet.has(entry.node.type.name)) {
      hunks.push({
        kind: 'remove',
        changeId: entry.id,
        basePos: entry.pos,
        baseNodeSize: entry.node.nodeSize,
      });
    }
  };

  // Lockstep walk. For each proposal entry: if it matches something downstream
  // in base, drain unmatched base entries between (emitting removes) and consume
  // the match. Otherwise it's an insert; anchor at the position of the next
  // unmatched base entry (the one this insert is logically replacing), falling
  // back to the end of the last matched base block. Anchoring at the unmatched
  // base position is what keeps "remove table X" + "insert table X'" visually
  // adjacent — without it, an edit to the first table inserts the new copy at
  // position 0 instead of next to the original.
  let bi = 0;
  let lastMatchedBaseEnd = 0;
  for (const pe of proposalEntries) {
    if (baseIds.has(pe.id)) {
      while (bi < baseEntries.length && baseEntries[bi].id !== pe.id) {
        if (!proposalIds.has(baseEntries[bi].id)) emitRemove(baseEntries[bi]);
        bi += 1;
      }
      if (bi < baseEntries.length) {
        lastMatchedBaseEnd = baseEntries[bi].end;
        bi += 1;
      }
      continue;
    }
    if (!blockTypeSet.has(pe.node.type.name)) continue;
    let anchor = lastMatchedBaseEnd;
    if (bi < baseEntries.length && !proposalIds.has(baseEntries[bi].id)) {
      anchor = baseEntries[bi].pos;
    }
    hunks.push({ kind: 'insert', changeId: pe.id, proposalNode: pe.node, anchorBasePos: anchor });
  }

  while (bi < baseEntries.length) {
    if (!proposalIds.has(baseEntries[bi].id)) emitRemove(baseEntries[bi]);
    bi += 1;
  }

  return hunks;
};
