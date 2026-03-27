/**
 * Shared helper for finding text marks from nearby paragraphs.
 * Used by insertParagraphAt and insertHeadingAt to copy formatting
 * from existing content so new nodes match the document's style.
 */

/** @type {RegExp} */
export const HEADING_STYLE_PATTERN = /^Heading\d$/;

/**
 * Extract meaningful text marks from a paragraph node.
 * Filters out parasitic marks (textStyle with all-null attrs from DOCX import)
 * that have no visual effect but bloat the document.
 *
 * @param {import('prosemirror-model').Node} paragraphNode
 * @returns {readonly import('prosemirror-model').Mark[]}
 */
function extractMeaningfulMarks(paragraphNode) {
  /** @type {import('prosemirror-model').Mark[] | null} */
  let found = null;

  paragraphNode.descendants((child) => {
    if (found) return false;
    if (!child.isText || child.marks.length === 0) return;

    // Filter marks: keep only those with at least one non-null attribute value
    const meaningful = child.marks.filter((mark) => {
      const attrs = mark.attrs;
      if (!attrs) return false;
      return Object.values(attrs).some((v) => v != null);
    });

    if (meaningful.length > 0) {
      found = meaningful;
      return false;
    }
  });

  return found ?? [];
}

/**
 * Find text marks from nearby paragraphs, with optional style preference.
 *
 * @param {import('prosemirror-model').Node} doc - The document node
 * @param {number} pos - Insertion position
 * @param {object} [options]
 * @param {'heading' | 'body'} [options.prefer] - Which style to prefer.
 *   'heading' prefers heading-styled paragraphs, falls back to body.
 *   'body' skips heading-styled paragraphs entirely.
 *   Omit to return marks from the first paragraph found.
 * @returns {readonly import('prosemirror-model').Mark[]}
 */
export function findNearbyMarks(doc, pos, { prefer } = {}) {
  const resolvedPos = doc.resolve(Math.min(pos, doc.content.size));
  let fallback = /** @type {readonly import('prosemirror-model').Mark[]} */ ([]);

  for (let d = resolvedPos.depth; d >= 0; d--) {
    const parent = resolvedPos.node(d);
    const index = resolvedPos.index(d);

    // Check siblings: before insertion point first, then after
    const candidates = [];
    for (let i = index - 1; i >= 0; i--) candidates.push(parent.child(i));
    for (let i = index; i < parent.childCount; i++) candidates.push(parent.child(i));

    for (const node of candidates) {
      if (node.type.name !== 'paragraph') continue;

      const marks = extractMeaningfulMarks(node);
      if (marks.length === 0) continue;

      const sid = node.attrs.paragraphProperties?.styleId;
      const isHeading = sid && HEADING_STYLE_PATTERN.test(sid);

      if (prefer === 'body') {
        // Skip headings, return first body paragraph marks
        if (!isHeading) return marks;
      } else if (prefer === 'heading') {
        // Prefer headings, fall back to body
        if (isHeading) return marks;
        if (fallback.length === 0) fallback = marks;
      } else {
        // No preference — return first paragraph with marks
        return marks;
      }
    }
  }

  return fallback;
}
