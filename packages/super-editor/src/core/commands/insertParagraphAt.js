/**
 * Resolve the styleId for a new paragraph. If an explicit styleId is
 * provided, use it. Otherwise, inherit from the nearest sibling paragraph
 * so new content matches the document's existing formatting.
 *
 * @param {import('prosemirror-model').Node} doc
 * @param {number} pos - insertion position
 * @param {string} [explicit] - caller-provided styleId
 * @returns {string | undefined}
 */
function resolveStyleId(doc, pos, explicit) {
  if (explicit) return explicit;

  // Look for the nearest paragraph before the insertion point
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  for (let d = $pos.depth; d >= 0; d--) {
    const parent = $pos.node(d);
    const index = $pos.index(d);

    // Check the node just before this position
    if (index > 0) {
      const before = parent.child(index - 1);
      if (before.type.name === 'paragraph') {
        const sid = before.attrs.paragraphProperties?.styleId;
        if (sid) return sid;
      }
    }

    // Check the node just after this position
    if (index < parent.childCount) {
      const after = parent.child(index);
      if (after.type.name === 'paragraph') {
        const sid = after.attrs.paragraphProperties?.styleId;
        if (sid) return sid;
      }
    }
  }

  return undefined;
}

/**
 * Insert a paragraph node at an absolute document position.
 *
 * Supports optional seed text, deterministic block id assignment,
 * named paragraph style (auto-inherits from siblings when omitted),
 * and operation-scoped tracked-change conversion via transaction meta.
 *
 * @param {{ pos: number; text?: string; sdBlockId?: string; paraId?: string; tracked?: boolean; styleId?: string }} options
 * @returns {import('./types/index.js').Command}
 */
export const insertParagraphAt =
  ({ pos, text = '', sdBlockId, paraId, tracked, styleId }) =>
  ({ state, dispatch }) => {
    const paragraphType = state.schema.nodes.paragraph;
    if (!paragraphType) return false;
    if (!Number.isInteger(pos) || pos < 0 || pos > state.doc.content.size) return false;

    const resolvedStyle = resolveStyleId(state.doc, pos, styleId);
    const attrs = {
      ...(sdBlockId ? { sdBlockId } : undefined),
      ...(paraId ? { paraId } : undefined),
      ...(resolvedStyle ? { paragraphProperties: { styleId: resolvedStyle } } : undefined),
    };
    const normalizedText = typeof text === 'string' ? text : '';
    const textNode = normalizedText.length > 0 ? state.schema.text(normalizedText) : null;

    let paragraphNode;
    try {
      paragraphNode =
        paragraphType.createAndFill(attrs, textNode ?? undefined) ??
        paragraphType.create(attrs, textNode ? [textNode] : undefined);
    } catch {
      return false;
    }

    if (!paragraphNode) return false;

    // Validate the structural insertion before the dispatch guard so that
    // editor.can().insertParagraphAt() accurately reflects feasibility.
    try {
      const tr = state.tr.insert(pos, paragraphNode);
      if (!dispatch) return true;
      tr.setMeta('inputType', 'programmatic');
      if (tracked === true) tr.setMeta('forceTrackChanges', true);
      else if (tracked === false) tr.setMeta('skipTrackChanges', true);
      dispatch(tr);
      return true;
    } catch {
      return false;
    }
  };
