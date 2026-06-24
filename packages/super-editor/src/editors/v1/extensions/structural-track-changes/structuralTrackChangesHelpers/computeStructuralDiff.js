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
