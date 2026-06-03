/**
 * Shared list-marker numbering font rules (Symbol/Wingdings, etc.).
 */

import { getNumberingProperties, type RunProperties } from '@superdoc/style-engine/ooxml';
import type { ConverterContext } from './converter-context.js';

export type NumberingPropertiesRef = { numId?: number; ilvl?: number } | null | undefined;

/**
 * True when w:lvl/w:rPr pins marker font family. Size is not pinned — markers still
 * scale with body/list text (SD-3238).
 */
export const numberingDefinesMarkerFontFamily = (
  numberingProperties: NumberingPropertiesRef,
  converterContext?: ConverterContext,
): boolean => {
  const numId = numberingProperties?.numId;
  if (numId == null || numId === 0 || !converterContext) {
    return false;
  }
  const ilvl = numberingProperties?.ilvl ?? 0;
  const numberingRunProps = getNumberingProperties<RunProperties>('runProperties', converterContext, ilvl, numId);
  return numberingRunProps.fontFamily != null;
};
