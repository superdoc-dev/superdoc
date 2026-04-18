import { updateSectionMargins, getSectPrMargins } from '@converter/section-properties.js';

/**
 * Insert (or ensure) a paragraph-level sectPr at the selection.
 * If a sectPr already exists on the governing paragraph, it will be reused and updated.
 * Optionally applies header/footer distances (inches) to the new/updated sectPr.
 *
 * This creates a section break, which allows different pages to have different margins.
 * The new margins apply starting from the next page after the section break.
 *
 * @param {{ headerInches?: number, footerInches?: number }} params - Optional margin values in inches
 * @param {number} [params.headerInches] - Distance from page top to content area (must be >= 0)
 * @param {number} [params.footerInches] - Distance from page bottom to content area (must be >= 0)
 * @returns {import('./types/index.js').Command}
 */
export const insertSectionBreakAtSelection =
  ({ headerInches, footerInches } = {}) =>
  ({ tr, state, editor }) => {
    if (!state || !editor) {
      console.warn('[insertSectionBreakAtSelection] Missing state or editor');
      return false;
    }

    // Validate margin values if provided
    if (typeof headerInches === 'number' && headerInches < 0) {
      console.warn('[insertSectionBreakAtSelection] headerInches must be >= 0, got:', headerInches);
      return false;
    }
    if (typeof footerInches === 'number' && footerInches < 0) {
      console.warn('[insertSectionBreakAtSelection] footerInches must be >= 0, got:', footerInches);
      return false;
    }

    const { $from } = state.selection;
    // Find nearest paragraph node and its position
    let paraPos = 0;
    let paragraph = null;
    for (let d = $from.depth; d >= 0; d -= 1) {
      const node = $from.node(d);
      if (node?.type?.name === 'paragraph') {
        paraPos = $from.before(d);
        paragraph = node;
        break;
      }
    }

    if (!paragraph || paraPos <= 0) {
      console.warn('[insertSectionBreakAtSelection] No paragraph found at selection');
      return false;
    }

    const paraProps = paragraph.attrs?.paragraphProperties || null;
    const existingSectPr = paraProps?.sectPr || null;

    // Create or clone sectPr
    const sectPr = existingSectPr
      ? JSON.parse(JSON.stringify(existingSectPr))
      : { type: 'element', name: 'w:sectPr', elements: [] };

    // Apply updates if provided
    const updates = {};
    if (headerInches != null) updates.headerInches = headerInches;
    if (footerInches != null) updates.footerInches = footerInches;
    if (Object.keys(updates).length) {
      updateSectionMargins({ type: 'sectPr', sectPr }, updates);
    }

    // Sync normalized inches to attrs.sectionMargins for UI
    const margins = getSectPrMargins(sectPr) || {};
    const sectionMargins = {
      header: margins.header ?? null,
      footer: margins.footer ?? null,
    };

    const newParagraphProperties = { ...(paraProps || {}), sectPr };
    const nextAttrs = {
      ...paragraph.attrs,
      paragraphProperties: newParagraphProperties,
      pageBreakSource: 'sectPr',
      sectionMargins,
    };

    tr.setNodeMarkup(paraPos, undefined, nextAttrs, paragraph.marks);
    return true;
  };
