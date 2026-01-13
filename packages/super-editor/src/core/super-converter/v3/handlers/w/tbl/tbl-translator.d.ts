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
export function translator(node: unknown, params: unknown): unknown;

/**
 * Gets referenced table styles from a style reference
 */
export function _getReferencedTableStyles(
  tableStyleReference: string | null,
  params: unknown,
  tblLook: unknown,
): TableStyles | null;
