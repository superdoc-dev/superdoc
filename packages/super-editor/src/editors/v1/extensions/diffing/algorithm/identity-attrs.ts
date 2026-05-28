/**
 * OOXML/import identity and revision fields that should not affect visible
 * diff semantics.
 *
 * `sdBlockId` and `sdBlockRev` are assigned by the block-node plugin and are
 * session-local — two editor instances loaded from the same DOCX hold
 * different values. `paraId`, `textId`, and the `rsid*` family are import-side
 * identity/revision fields whose values can differ across copies of the same
 * visible content.
 *
 * The diff fingerprint must be stable against changes to these attrs, otherwise
 * `diff.apply` across two editor instances rejects with `PRECONDITION_FAILED`
 * even when both editors hold the same document content. See SD-3279.
 */
export const NON_SEMANTIC_BLOCK_ATTRS = new Set<string>([
  'sdBlockId',
  'sdBlockRev',
  'paraId',
  'textId',
  'rsidR',
  'rsidRDefault',
  'rsidP',
  'rsidRPr',
  'rsidDel',
]);
