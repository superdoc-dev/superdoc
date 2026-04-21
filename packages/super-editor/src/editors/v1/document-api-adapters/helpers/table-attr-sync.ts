import { twipsToPixels } from '../../core/super-converter/helpers.js';

/**
 * Derives the promoted table node attrs that pm-adapter reads at runtime.
 *
 * The importer performs the same extraction when decoding OOXML table properties.
 * Any write path that mutates `tableProperties` on a table node must mirror that
 * extraction so rendering observes the new values immediately instead of waiting
 * for a re-import cycle.
 *
 * @param tp - Canonical nested table properties stored on the ProseMirror table node.
 * @returns Promoted attrs that should be spread onto the same table node.
 */
export function syncExtractedTableAttrs(tp: Record<string, unknown>): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};

  extracted.tableStyleId = tp.tableStyleId ?? null;
  extracted.justification = tp.justification ?? null;
  extracted.tableLayout = tp.tableLayout ?? null;
  extracted.borders = tp.borders ?? null;

  const indent = tp.tableIndent as { value?: number; type?: string } | undefined;
  if (indent?.value != null) {
    extracted.tableIndent = {
      width: twipsToPixels(indent.value),
      type: indent.type,
    };
  } else {
    extracted.tableIndent = null;
  }

  const spacing = tp.tableCellSpacing as { value?: number; type?: string } | undefined;
  if (spacing?.value != null) {
    extracted.tableCellSpacing = {
      w: String(spacing.value),
      type: spacing.type ?? 'dxa',
    };
    extracted.borderCollapse = 'separate';
  } else {
    extracted.tableCellSpacing = null;
    extracted.borderCollapse = null;
  }

  const width = tp.tableWidth as { value?: number; type?: string } | undefined;
  if (width) {
    if (width.type === 'pct' && typeof width.value === 'number') {
      extracted.tableWidth = { value: width.value, type: 'pct' };
    } else if (width.type === 'auto') {
      extracted.tableWidth = { width: 0, type: 'auto' };
    } else if (width.value != null) {
      const widthPx = twipsToPixels(width.value);
      extracted.tableWidth = widthPx != null ? { width: widthPx, type: width.type } : null;
    } else {
      extracted.tableWidth = null;
    }
  } else {
    extracted.tableWidth = null;
  }

  return extracted;
}

/**
 * Builds the canonical table attrs for a width-authoring mutation.
 *
 * Width edits are treated as an explicit authoring signal that the table should
 * now be fixed-layout. The nested `tableProperties.tableLayout` value drives
 * DOCX export, while the promoted top-level attrs keep pm-adapter/layout in sync
 * during the current editor session.
 *
 * @param currentAttrs - Existing table node attrs before mutation.
 * @param attrOverrides - Additional top-level attrs to write alongside the fixed layout sync.
 * @param tablePropertyOverrides - Nested `tableProperties` updates that should accompany the width edit.
 * @returns Fully synchronized table attrs for `setNodeMarkup`.
 */
export function buildWidthAuthoringTableAttrs(
  currentAttrs: Record<string, unknown>,
  attrOverrides: Record<string, unknown> = {},
  tablePropertyOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const currentTableProps = (currentAttrs.tableProperties ?? {}) as Record<string, unknown>;
  const updatedTableProps = {
    ...currentTableProps,
    ...tablePropertyOverrides,
    tableLayout: 'fixed',
  };

  return {
    ...currentAttrs,
    tableProperties: updatedTableProps,
    ...attrOverrides,
    ...syncExtractedTableAttrs(updatedTableProps),
    userEdited: true,
  };
}
