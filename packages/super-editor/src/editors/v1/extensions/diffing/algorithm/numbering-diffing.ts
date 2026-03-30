import type { NumberingProperties } from '@superdoc/style-engine/ooxml';
import { getAttributesDiff, type AttributesDiff } from './attributes-diffing';

/**
 * Structured diff for numbering document metadata and numbering definitions.
 */
export type NumberingDiff = AttributesDiff;

/**
 * Computes a diff between two numbering snapshots.
 *
 * @param oldNumbering Previous numbering snapshot.
 * @param newNumbering Updated numbering snapshot.
 * @returns Numbering diff or `null` when no changes are detected.
 */
export function diffNumbering(
  oldNumbering: NumberingProperties | null | undefined,
  newNumbering: NumberingProperties | null | undefined,
): NumberingDiff | null {
  return getAttributesDiff(
    (oldNumbering ?? {}) as unknown as Record<string, unknown>,
    (newNumbering ?? {}) as unknown as Record<string, unknown>,
  );
}
