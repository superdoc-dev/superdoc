/**
 * Table Style ID Selection
 *
 * Central module for determining which table style applies in a given context.
 * Owns all style-ID-selection precedence logic. No other package re-implements
 * this precedence.
 */

import type { StylesDocumentProperties, StyleDefinition } from './styles-types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

export const TABLE_STYLE_ID_TABLE_GRID = 'TableGrid';
export const TABLE_STYLE_ID_TABLE_NORMAL = 'TableNormal';

/** Fallback border applied when no table style exists at all (source: 'none'). */
export const TABLE_FALLBACK_BORDER = { val: 'single', size: 4, color: '#000000' } as const;

export const TABLE_FALLBACK_BORDERS = {
  top: { ...TABLE_FALLBACK_BORDER },
  left: { ...TABLE_FALLBACK_BORDER },
  bottom: { ...TABLE_FALLBACK_BORDER },
  right: { ...TABLE_FALLBACK_BORDER },
  insideH: { ...TABLE_FALLBACK_BORDER },
  insideV: { ...TABLE_FALLBACK_BORDER },
} as const;

/** Default cell padding in dxa (twips). left/right = 108 dxa ≈ 0.075in, matching Word defaults. */
export const TABLE_FALLBACK_CELL_PADDING = { top: 0, bottom: 0, left: 108, right: 108 } as const;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ResolvedStyleSource = 'explicit' | 'settings-default' | 'type-default' | 'builtin-fallback' | 'none';

export interface ResolvedStyle {
  styleId: string | null;
  source: ResolvedStyleSource;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a style ID exists in the catalog and is of type `table`.
 */
export function isKnownTableStyleId(
  styleId: string | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties | null | undefined,
): boolean {
  if (!styleId || !translatedLinkedStyles?.styles) return false;
  const def = translatedLinkedStyles.styles[styleId];
  return def != null && def.type === 'table';
}

/**
 * Finds the type-default table style: `w:style w:type="table" w:default="1"`.
 * Typically `TableNormal`.
 */
export function findTypeDefaultTableStyleId(
  translatedLinkedStyles: StylesDocumentProperties | null | undefined,
): string | null {
  if (!translatedLinkedStyles?.styles) return null;
  for (const [styleId, def] of Object.entries(translatedLinkedStyles.styles)) {
    if (def.type === 'table' && def.default === true) {
      return styleId;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Existing Table Resolution
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Determines the effective style ID for a table already in the document.
 *
 * Precedence:
 *  1. Explicit `tableStyleId` on the node, if valid (exists + type=table).
 *  2. Type-default table style from catalog (`w:default="1"`).
 *  3. No style (`source: 'none'`).
 */
export function resolveExistingTableEffectiveStyleId(
  explicitTableStyleId: string | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties | null | undefined,
): ResolvedStyle {
  // 1. Explicit
  if (explicitTableStyleId && isKnownTableStyleId(explicitTableStyleId, translatedLinkedStyles)) {
    return { styleId: explicitTableStyleId, source: 'explicit' };
  }

  // 2. Type-default
  const typeDefault = findTypeDefaultTableStyleId(translatedLinkedStyles);
  if (typeDefault) {
    return { styleId: typeDefault, source: 'type-default' };
  }

  // 3. No style
  return { styleId: null, source: 'none' };
}

// ──────────────────────────────────────────────────────────────────────────────
// New Table Resolution
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Determines the preferred style ID for a newly created table.
 *
 * Precedence:
 *  1. `w:defaultTableStyle` from settings, if present and resolvable.
 *  2. Type-default table style (`w:default="1"`).
 *  3. `TableGrid` if it exists in catalog (builtin-fallback).
 *  4. `TableNormal` if it exists in catalog (builtin-fallback).
 *  5. No style (`source: 'none'`).
 */
export function resolvePreferredNewTableStyleId(
  settingsDefaultTableStyleId: string | null | undefined,
  translatedLinkedStyles: StylesDocumentProperties | null | undefined,
): ResolvedStyle {
  // 1. Settings default
  if (settingsDefaultTableStyleId && isKnownTableStyleId(settingsDefaultTableStyleId, translatedLinkedStyles)) {
    return { styleId: settingsDefaultTableStyleId, source: 'settings-default' };
  }

  // 2. Type-default (skip TableNormal — it's the OOXML base/reset style, not a visual style)
  const typeDefault = findTypeDefaultTableStyleId(translatedLinkedStyles);
  if (typeDefault && typeDefault !== TABLE_STYLE_ID_TABLE_NORMAL) {
    return { styleId: typeDefault, source: 'type-default' };
  }

  // 3. TableGrid builtin
  if (isKnownTableStyleId(TABLE_STYLE_ID_TABLE_GRID, translatedLinkedStyles)) {
    return { styleId: TABLE_STYLE_ID_TABLE_GRID, source: 'builtin-fallback' };
  }

  // 4. No style — use inline fallback borders
  return { styleId: null, source: 'none' };
}
