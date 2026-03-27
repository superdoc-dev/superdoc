/**
 * Table styles result
 */
export interface TableStyles {
  name?: unknown;
  borders?: Record<string, unknown>;
  cellMargins?: Record<string, unknown>;
  justification?: string;
  tableCellSpacing?: { value?: number; type?: string };
}

/**
 * Table translator function
 */
export function translator(node: unknown, params: unknown): unknown;

/**
 * Gets referenced table styles from a style reference
 */
export function _getReferencedTableStyles(tableStyleReference: string | null, params: unknown): TableStyles | null;
