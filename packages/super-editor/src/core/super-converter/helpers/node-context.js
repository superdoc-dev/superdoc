const INLINE_PARENT_NAMES = new Set([
  'w:r',
  'w:hyperlink',
  'w:smartTag',
  'w:fldSimple',
  'w:proofErr',
  'w:del',
  'w:ins',
  'w:p', // Paragraph is an inline container; unknown children must be inline-safe
]);

const INLINE_NODE_NAMES = new Set([
  'm:oMathPara',
  'm:oMath',
  'm:t',
  'm:r',
  'm:ctrlPr',
  'm:sSupPr',
  'm:e',
  'm:sup',
  'm:sSup',
]);

const BLOCK_BOUNDARY_NAMES = new Set(['w:body', 'w:tbl', 'w:tc', 'w:tr']);

/**
 * Determines if the current DOCX node position accepts inline-only content.
 * Walks up the ancestor chain until it finds an inline parent or block boundary.
 *
 * @param {Array<{ name?: string }>} [path=[]] Ancestor chain leading to the current node.
 * @param {string} [currentNodeName] Optional immediate node name override.
 * @returns {boolean}
 */
export const isInlineContext = (path = [], currentNodeName) => {
  const immediateName = currentNodeName ?? path[path.length - 1]?.name;
  if (immediateName && INLINE_NODE_NAMES.has(immediateName)) {
    return true;
  }
  if (!Array.isArray(path) || path.length === 0) return false;

  for (let i = path.length - 1; i >= 0; i--) {
    const ancestorName = path[i]?.name;
    if (!ancestorName) continue;
    if (INLINE_NODE_NAMES.has(ancestorName) || INLINE_PARENT_NAMES.has(ancestorName)) {
      return true;
    }
    if (BLOCK_BOUNDARY_NAMES.has(ancestorName)) {
      return false;
    }
  }

  return false;
};
