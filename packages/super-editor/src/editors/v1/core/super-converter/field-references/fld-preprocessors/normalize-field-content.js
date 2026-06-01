/**
 * Normalize the result-content nodes of a field code so they can be placed
 * inside a PM node whose schema requires `paragraph+`.
 *
 * Field-code preprocessors (BIBLIOGRAPHY, INDEX, TOA) wrap whatever
 * `nodesToCombine` they receive from `preProcessNodesForFldChar`. When the
 * field envelope spans multiple paragraphs the collected nodes are <w:p>s
 * and everything is fine. When the envelope lives inside a single
 * paragraph the collected nodes are loose <w:r> runs (or other inline
 * elements). Wrapping those directly violates the PM schema and crashes
 * the editor on import — see SD-3005.
 *
 * This helper groups adjacent non-<w:p> nodes into synthesized paragraphs
 * and preserves any existing <w:p> nodes as-is. An empty input yields a
 * single empty paragraph so the downstream PM schema (`paragraph+`) is
 * always satisfied.
 *
 * @param {import('../../v2/types/index.js').OpenXmlNode[] | null | undefined} nodes
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function normalizeFieldContentToParagraphs(nodes) {
  const input = Array.isArray(nodes) ? nodes : [];
  if (input.length === 0) {
    return [{ name: 'w:p', type: 'element', elements: [] }];
  }

  const out = [];
  let buffer = null;

  const flushBuffer = () => {
    if (buffer) {
      out.push({ name: 'w:p', type: 'element', elements: buffer });
      buffer = null;
    }
  };

  for (const node of input) {
    if (node?.name === 'w:p') {
      flushBuffer();
      out.push(node);
    } else {
      if (!buffer) buffer = [];
      buffer.push(node);
    }
  }
  flushBuffer();

  return out;
}
