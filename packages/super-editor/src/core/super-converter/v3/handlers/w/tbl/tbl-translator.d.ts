import type { NodeTranslator, SCEncoderConfig } from '@translator';

/**
 * Table styles result
 */
export interface TableStyles {
  name?: unknown;
  borders?: Record<string, unknown>;
  cellMargins?: Record<string, unknown>;
  justification?: string;
}

/**
 * Table translator function
 */
export const translator: NodeTranslator;

/**
 * Gets referenced table styles from a style reference
 */
export function _getReferencedTableStyles(
  tableStyleReference: string | null,
  params: SCEncoderConfig,
): TableStyles | null;
