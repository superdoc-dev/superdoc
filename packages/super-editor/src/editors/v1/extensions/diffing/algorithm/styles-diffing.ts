import type { StyleDefinition, StylesDocumentProperties } from '@superdoc/style-engine/ooxml';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing';

/**
 * Structured diff for style document metadata and style definitions.
 */
export interface StylesDiff {
  /** Diff for `docDefaults`. */
  docDefaultsDiff: AttributesDiff | null;
  /** Diff for `latentStyles`. */
  latentStylesDiff: AttributesDiff | null;
  /** Styles present only in the new style snapshot. */
  addedStyles: Record<string, StyleDefinition>;
  /** Styles present only in the old style snapshot. */
  removedStyles: Record<string, StyleDefinition>;
  /** Diffs for style definitions present in both snapshots. */
  modifiedStyles: Record<string, AttributesDiff>;
}

function hasOwnStyle(styleMap: Record<string, StyleDefinition>, styleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(styleMap, styleId);
}

/**
 * Computes a diff between two style snapshots.
 *
 * @param oldStyles Previous style snapshot.
 * @param newStyles Updated style snapshot.
 * @returns Style diff or `null` when no changes are detected.
 */
export function diffStyles(
  oldStyles: StylesDocumentProperties | null | undefined,
  newStyles: StylesDocumentProperties | null | undefined,
): StylesDiff | null {
  const oldStyleMap = oldStyles?.styles ?? {};
  const newStyleMap = newStyles?.styles ?? {};

  const addedStyles: Record<string, StyleDefinition> = {};
  const removedStyles: Record<string, StyleDefinition> = {};
  const modifiedStyles: Record<string, AttributesDiff> = {};

  for (const [styleId, styleDef] of Object.entries(newStyleMap)) {
    if (!hasOwnStyle(oldStyleMap, styleId)) {
      addedStyles[styleId] = styleDef;
    }
  }

  for (const [styleId, styleDef] of Object.entries(oldStyleMap)) {
    if (!hasOwnStyle(newStyleMap, styleId)) {
      removedStyles[styleId] = styleDef;
      continue;
    }

    const attrsDiff = getAttributesDiff(
      styleDef as unknown as Record<string, unknown>,
      newStyleMap[styleId] as unknown as Record<string, unknown>,
    );
    if (attrsDiff) {
      modifiedStyles[styleId] = attrsDiff;
    }
  }

  const docDefaultsDiff = getAttributesDiff(
    (oldStyles?.docDefaults ?? {}) as unknown as Record<string, unknown>,
    (newStyles?.docDefaults ?? {}) as unknown as Record<string, unknown>,
  );
  const latentStylesDiff = getAttributesDiff(
    (oldStyles?.latentStyles ?? {}) as unknown as Record<string, unknown>,
    (newStyles?.latentStyles ?? {}) as unknown as Record<string, unknown>,
  );

  const hasChanges =
    Boolean(docDefaultsDiff) ||
    Boolean(latentStylesDiff) ||
    Object.keys(addedStyles).length > 0 ||
    Object.keys(removedStyles).length > 0 ||
    Object.keys(modifiedStyles).length > 0;

  if (!hasChanges) {
    return null;
  }

  return {
    docDefaultsDiff,
    latentStylesDiff,
    addedStyles,
    removedStyles,
    modifiedStyles,
  };
}
