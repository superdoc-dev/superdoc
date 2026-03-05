// @ts-check
import {
  DEFAULT_TBL_LOOK,
  resolvePreferredNewTableStyleId,
  TABLE_FALLBACK_BORDERS,
  TABLE_FALLBACK_CELL_PADDING,
  TABLE_STYLE_ID_TABLE_GRID,
} from '@superdoc/style-engine/ooxml';
import { readDefaultTableStyle, readSettingsRoot } from '../../../document-api-adapters/document-settings.js';

/**
 * @typedef {Object} NormalizedTableAttrs
 * @property {string | null} tableStyleId - Resolved style ID (null if source is 'none')
 * @property {Object} [borders] - Fallback borders when no style exists
 * @property {Object} [tableProperties] - Table properties including fallback cellMargins
 */

/**
 * Resolves the preferred table style ID from the editor's converter context.
 * Encapsulates settings access and style catalog lookup.
 *
 * @param {Object} editor - The super-editor instance
 * @returns {{ styleId: string | null, source: string }}
 */
export function resolvePreferredNewTableStyleIdFromEditor(editor) {
  const converter = editor?.converter;
  const translatedLinkedStyles = converter?.translatedLinkedStyles ?? null;

  let settingsDefaultStyleId = null;
  if (converter) {
    const settingsRoot = readSettingsRoot(converter);
    if (settingsRoot) {
      settingsDefaultStyleId = readDefaultTableStyle(settingsRoot);
    }
  }

  return resolvePreferredNewTableStyleId(settingsDefaultStyleId, translatedLinkedStyles);
}

/**
 * Computes the attributes for a newly created table.
 *
 * When a style is resolved, returns only `tableStyleId` — borders come from
 * the style at render time via `resolveTableProperties`.
 * When no style exists (`source: 'none'`), returns inline fallback borders
 * and cell padding so the table renders with sensible defaults.
 *
 * @param {Object} editor - The super-editor instance
 * @returns {NormalizedTableAttrs}
 */
export function normalizeNewTableAttrs(editor) {
  const resolved = resolvePreferredNewTableStyleIdFromEditor(editor);

  if (resolved.source === 'none') {
    return {
      tableStyleId: null,
      borders: { ...TABLE_FALLBACK_BORDERS },
      tableProperties: {
        borders: { ...TABLE_FALLBACK_BORDERS },
        cellMargins: {
          marginTop: { value: TABLE_FALLBACK_CELL_PADDING.top, type: 'dxa' },
          marginBottom: { value: TABLE_FALLBACK_CELL_PADDING.bottom, type: 'dxa' },
          marginLeft: { value: TABLE_FALLBACK_CELL_PADDING.left, type: 'dxa' },
          marginRight: { value: TABLE_FALLBACK_CELL_PADDING.right, type: 'dxa' },
        },
      },
    };
  }

  return {
    tableStyleId: resolved.styleId,
    // Also include tableStyleId inside tableProperties so the exporter's
    // decodeProperties loop (which iterates Object.keys(tableProperties))
    // finds it and writes <w:tblStyle> into <w:tblPr>.
    tableProperties: { tableStyleId: resolved.styleId, tblLook: { ...DEFAULT_TBL_LOOK } },
  };
}

/**
 * Fallback style ID for standalone contexts (markdown import without editor).
 * Matches Word behavior where `TableGrid` is always the default.
 */
export const STANDALONE_TABLE_STYLE_ID = TABLE_STYLE_ID_TABLE_GRID;
