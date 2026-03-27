/**
 * Update document default header/footer distances (inches) via editor.updatePageStyle.
 * Triggers pagination update.
 *
 * @param {{ headerInches?: number, footerInches?: number }} params - Margin values in inches
 * @param {number} [params.headerInches] - Distance from page top to content area (must be >= 0)
 * @param {number} [params.footerInches] - Distance from page bottom to content area (must be >= 0)
 * @returns {import('./types/index.js').Command}
 */
export const setBodyHeaderFooter =
  ({ headerInches, footerInches } = {}) =>
  ({ editor }) => {
    if (!editor) {
      console.warn('[setBodyHeaderFooter] No editor instance provided');
      return false;
    }

    const hasHeader = typeof headerInches === 'number';
    const hasFooter = typeof footerInches === 'number';

    if (!hasHeader && !hasFooter) {
      console.warn('[setBodyHeaderFooter] No margin values provided');
      return false;
    }

    // Validate positive values
    if (hasHeader && headerInches < 0) {
      console.warn('[setBodyHeaderFooter] headerInches must be >= 0, got:', headerInches);
      return false;
    }
    if (hasFooter && footerInches < 0) {
      console.warn('[setBodyHeaderFooter] footerInches must be >= 0, got:', footerInches);
      return false;
    }

    if (!editor.updatePageStyle) {
      console.warn('[setBodyHeaderFooter] editor.updatePageStyle is not available');
      return false;
    }

    const styles = editor.getPageStyles?.() || {};
    const current = styles.pageMargins || {};
    const next = { ...current };
    if (hasHeader) next.header = headerInches;
    if (hasFooter) next.footer = footerInches;

    editor.updatePageStyle({ pageMargins: next });
    return true;
  };
