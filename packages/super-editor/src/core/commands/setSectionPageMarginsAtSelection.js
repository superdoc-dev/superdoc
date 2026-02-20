import { updateSectionMargins, getSectPrMargins } from '@converter/section-properties.js';

/**
 * Find the governing section break (paragraph with sectPr) for the current selection.
 * Prefers the first sectPr at or after the selection; falls back to the last before it.
 */
function findGoverningSectPrParagraph(doc, selectionPos) {
  const candidates = [];
  doc.descendants((node, nodePos) => {
    if (node.type?.name === 'paragraph' && node.attrs?.paragraphProperties?.sectPr) {
      candidates.push({ node, pos: nodePos });
    }
  });
  if (!candidates.length) return null;

  // First, prefer a paragraph that actually contains the selection.
  const inside = candidates.find((c) => selectionPos >= c.pos && selectionPos < c.pos + c.node.nodeSize);
  if (inside) return inside;

  // Otherwise, fall back to the first sectPr at or after the selection,
  // or the last before if none are after.
  const atOrAfter = candidates.find((c) => c.pos >= selectionPos);
  return atOrAfter ?? candidates[candidates.length - 1];
}

/**
 * Update page margins (top/right/bottom/left) for the current section.
 * - If a paragraph-level sectPr exists for the section, mutate that sectPr.
 * - Otherwise fall back to the body-level sectPr (final section).
 *
 * @param {{ topInches?: number; rightInches?: number; bottomInches?: number; leftInches?: number }} params
 * @returns {import('./types/index.js').Command}
 */
export const setSectionPageMarginsAtSelection =
  ({ topInches, rightInches, bottomInches, leftInches } = {}) =>
  ({ tr, state, editor }) => {
    if (!state || !editor) {
      console.warn('[setSectionPageMarginsAtSelection] Missing state or editor');
      return false;
    }

    const hasTop = typeof topInches === 'number';
    const hasRight = typeof rightInches === 'number';
    const hasBottom = typeof bottomInches === 'number';
    const hasLeft = typeof leftInches === 'number';
    if (!hasTop && !hasRight && !hasBottom && !hasLeft) {
      console.warn('[setSectionPageMarginsAtSelection] No margin values provided');
      return false;
    }
    if (
      (hasTop && topInches < 0) ||
      (hasRight && rightInches < 0) ||
      (hasBottom && bottomInches < 0) ||
      (hasLeft && leftInches < 0)
    ) {
      console.warn('[setSectionPageMarginsAtSelection] Margin values must be >= 0');
      return false;
    }

    const updates = {};
    if (hasTop) updates.topInches = topInches;
    if (hasRight) updates.rightInches = rightInches;
    if (hasBottom) updates.bottomInches = bottomInches;
    if (hasLeft) updates.leftInches = leftInches;

    const { from } = state.selection;
    const governing = findGoverningSectPrParagraph(state.doc, from);

    if (governing) {
      const { node, pos } = governing;
      const paraProps = node.attrs?.paragraphProperties || null;
      const existingSectPr = paraProps?.sectPr || null;
      if (!existingSectPr) {
        console.warn('[setSectionPageMarginsAtSelection] Paragraph found but has no sectPr');
        return false;
      }

      const sectPr = JSON.parse(JSON.stringify(existingSectPr));
      try {
        updateSectionMargins({ type: 'sectPr', sectPr }, updates);
      } catch (err) {
        console.error('[setSectionPageMarginsAtSelection] Failed to update sectPr:', err);
        return false;
      }

      const resolved = getSectPrMargins(sectPr);
      const normalizedSectionMargins = {
        top: resolved.top ?? null,
        right: resolved.right ?? null,
        bottom: resolved.bottom ?? null,
        left: resolved.left ?? null,
        header: resolved.header ?? null,
        footer: resolved.footer ?? null,
      };

      const newParagraphProperties = { ...(paraProps || {}), sectPr };
      const nextAttrs = {
        ...node.attrs,
        paragraphProperties: newParagraphProperties,
        sectionMargins: normalizedSectionMargins,
      };

      tr.setNodeMarkup(pos, undefined, nextAttrs, node.marks);
      tr.setMeta('forceUpdatePagination', true);
      return true;
    }

    // Fall back to body-level sectPr (final section)
    const docAttrs = state.doc.attrs ?? {};
    const converter = editor.converter ?? null;
    const baseBodySectPr = docAttrs.bodySectPr || converter?.bodySectPr || null;
    const sectPr =
      baseBodySectPr != null
        ? JSON.parse(JSON.stringify(baseBodySectPr))
        : { type: 'element', name: 'w:sectPr', elements: [] };

    try {
      updateSectionMargins({ type: 'sectPr', sectPr }, updates);
    } catch (err) {
      console.error('[setSectionPageMarginsAtSelection] Failed to update sectPr:', err);
      return false;
    }

    // Persist to converter and keep converter.pageStyles.pageMargins in sync
    if (converter) {
      converter.bodySectPr = sectPr;
      if (!converter.pageStyles) converter.pageStyles = {};
      if (!converter.pageStyles.pageMargins) converter.pageStyles.pageMargins = {};
      const pageMargins = converter.pageStyles.pageMargins;
      const resolved = getSectPrMargins(sectPr);
      if (resolved.top != null) pageMargins.top = resolved.top;
      if (resolved.right != null) pageMargins.right = resolved.right;
      if (resolved.bottom != null) pageMargins.bottom = resolved.bottom;
      if (resolved.left != null) pageMargins.left = resolved.left;
      if (resolved.header != null) pageMargins.header = resolved.header;
      if (resolved.footer != null) pageMargins.footer = resolved.footer;
    }

    // Write updated body sectPr onto the doc attrs so layout sees it immediately
    const nextDocAttrs = { ...docAttrs, bodySectPr: sectPr };
    tr.setNodeMarkup(0, undefined, nextDocAttrs);

    tr.setMeta('forceUpdatePagination', true);
    return true;
  };
