import { updateSectionMargins, getSectPrMargins } from '@converter/section-properties.js';

/**
 * Find the nearest paragraph at or before a given document position that carries a sectPr.
 * A paragraph with sectPr represents a section break in the document.
 *
 * @param {import('prosemirror-model').Node} doc - The ProseMirror document node
 * @param {number} pos - Document position to search from
 * @returns {{ node: import('prosemirror-model').Node, pos: number }|null} The paragraph node and position, or null if not found
 */
function findNearestParagraphWithSectPr(doc, pos) {
  let target = null;
  doc.descendants((node, nodePos) => {
    if (nodePos > pos) return false;
    if (node.type?.name === 'paragraph' && node.attrs?.paragraphProperties?.sectPr) {
      target = { node, pos: nodePos };
    }
    return true;
  });
  return target;
}

/**
 * Update header/footer distances (inches) on the governing section (paragraph-level sectPr).
 * This command targets section-specific margins. If no section break exists at the selection,
 * the command will fail and return false. Use setBodyHeaderFooter for document defaults.
 *
 * Mutates the paragraph's raw sectPr JSON and triggers pagination update.
 *
 * @param {{ headerInches?: number, footerInches?: number }} params - Margin values in inches
 * @param {number} [params.headerInches] - Distance from page top to content area (must be >= 0)
 * @param {number} [params.footerInches] - Distance from page bottom to content area (must be >= 0)
 * @returns {import('./types/index.js').Command}
 */
export const setSectionHeaderFooterAtSelection =
  ({ headerInches, footerInches } = {}) =>
  ({ tr, state, editor }) => {
    if (!state || !editor) {
      console.warn('[setSectionHeaderFooterAtSelection] Missing state or editor');
      return false;
    }

    const hasHeader = typeof headerInches === 'number';
    const hasFooter = typeof footerInches === 'number';

    if (!hasHeader && !hasFooter) {
      console.warn('[setSectionHeaderFooterAtSelection] No margin values provided');
      return false;
    }

    // Validate positive values
    if (hasHeader && headerInches < 0) {
      console.warn('[setSectionHeaderFooterAtSelection] headerInches must be >= 0, got:', headerInches);
      return false;
    }
    if (hasFooter && footerInches < 0) {
      console.warn('[setSectionHeaderFooterAtSelection] footerInches must be >= 0, got:', footerInches);
      return false;
    }

    const { from } = state.selection;
    const found = findNearestParagraphWithSectPr(state.doc, from);

    if (!found) {
      console.warn('[setSectionHeaderFooterAtSelection] No section break found at or before selection');
      return false;
    }

    const { node, pos } = found;
    const paraProps = node.attrs?.paragraphProperties || null;
    const existingSectPr = paraProps?.sectPr || null;

    if (!existingSectPr) {
      console.warn('[setSectionHeaderFooterAtSelection] Paragraph found but has no sectPr');
      return false;
    }

    // Clone sectPr to avoid mutating node attrs in place
    const sectPr = JSON.parse(JSON.stringify(existingSectPr));

    const updates = {};
    if (hasHeader) updates.headerInches = headerInches;
    if (hasFooter) updates.footerInches = footerInches;

    try {
      updateSectionMargins({ type: 'sectPr', sectPr }, updates);
    } catch (err) {
      console.error('[setSectionHeaderFooterAtSelection] Failed to update sectPr:', err);
      return false;
    }

    const newParagraphProperties = { ...(paraProps || {}), sectPr };
    const resolvedMargins = getSectPrMargins(sectPr);
    const normalizedMargins = {
      header: resolvedMargins.header ?? null,
      footer: resolvedMargins.footer ?? null,
    };
    const nextAttrs = {
      ...node.attrs,
      paragraphProperties: newParagraphProperties,
      sectionMargins: normalizedMargins,
    };

    tr.setNodeMarkup(pos, undefined, nextAttrs, node.marks);
    return true;
  };
