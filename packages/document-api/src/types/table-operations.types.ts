import type { BlockNodeAddress } from './base.js';
import type { ReceiptFailure, ReceiptInsert } from './receipt.js';

// ---------------------------------------------------------------------------
// Shared locator types
// ---------------------------------------------------------------------------

/**
 * Locates a table by either a resolved block address or a raw node ID.
 * Used as the base locator for table-scoped operations.
 */
export interface TableLocator {
  target?: BlockNodeAddress;
  nodeId?: string;
}

/**
 * Locates a table row. Identical shape to {@link TableLocator} when the
 * target/nodeId already points at a row node.
 */
export type RowLocator = TableLocator;

/**
 * Locates a table cell. Identical shape to {@link TableLocator} when the
 * target/nodeId already points at a cell node.
 */
export type CellLocator = TableLocator;

/**
 * Locates a row by its index within a specific table.
 */
export interface TableScopedRowLocator {
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  rowIndex: number;
}

/**
 * Locates a column by its index within a specific table.
 */
export interface TableScopedColumnLocator {
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  columnIndex: number;
}

/**
 * Locates a cell by row and column index within a specific table.
 */
export interface TableScopedCellLocator {
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  rowIndex: number;
  columnIndex: number;
}

/**
 * Defines a rectangular range of cells for merge/unmerge operations.
 */
export interface MergeRangeLocator {
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  start: { rowIndex: number; columnIndex: number };
  end: { rowIndex: number; columnIndex: number };
}

// ---------------------------------------------------------------------------
// Shared location / result types
// ---------------------------------------------------------------------------

/**
 * Where to place a newly-created table in the document.
 */
export type TableCreateLocation =
  | { kind: 'documentStart' }
  | { kind: 'documentEnd' }
  | { kind: 'before'; target: BlockNodeAddress }
  | { kind: 'after'; target: BlockNodeAddress }
  | { kind: 'before'; nodeId: string }
  | { kind: 'after'; nodeId: string };

/**
 * Generic success result for table mutation operations.
 */
export interface TableMutationSuccess {
  success: true;
  table?: BlockNodeAddress;
  trackedChangeRefs?: ReceiptInsert[];
}

/**
 * Generic failure result for table mutation operations.
 */
export interface TableMutationFailure {
  success: false;
  failure: ReceiptFailure;
}

/**
 * Discriminated union returned by most table mutation operations.
 */
export type TableMutationResult = TableMutationSuccess | TableMutationFailure;

// ---------------------------------------------------------------------------
// create.table
// ---------------------------------------------------------------------------

export interface CreateTableInput {
  rows: number;
  columns: number;
  at?: TableCreateLocation;
}

export interface CreateTableSuccessResult {
  success: true;
  table: BlockNodeAddress;
  trackedChangeRefs?: ReceiptInsert[];
}

export type CreateTableResult = CreateTableSuccessResult | TableMutationFailure;

// ---------------------------------------------------------------------------
// tables.convertFromText
// ---------------------------------------------------------------------------

export type ConvertFromTextDelimiter = 'tab' | 'comma' | 'paragraph' | { custom: string };

export interface TablesConvertFromTextInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  delimiter?: ConvertFromTextDelimiter;
  columns?: number;
  inferColumns?: boolean;
}

// ---------------------------------------------------------------------------
// tables.delete  (input: TableLocator)
// tables.clearContents  (input: TableLocator)
// ---------------------------------------------------------------------------

// These operations use `TableLocator` directly as their input type.

// ---------------------------------------------------------------------------
// tables.move
// ---------------------------------------------------------------------------

export interface TablesMoveInput extends TableLocator {
  destination: TableCreateLocation;
}

// ---------------------------------------------------------------------------
// tables.split
// ---------------------------------------------------------------------------

export interface TablesSplitInput extends TableLocator {
  atRowIndex: number;
}

// ---------------------------------------------------------------------------
// tables.convertToText
// ---------------------------------------------------------------------------

export interface TablesConvertToTextInput extends TableLocator {
  delimiter?: 'tab' | 'comma' | 'paragraph';
}

// ---------------------------------------------------------------------------
// tables.setLayout
// ---------------------------------------------------------------------------

export type TableAutoFitMode = 'fixedWidth' | 'fitContents' | 'fitWindow';
export type TableAlignment = 'left' | 'center' | 'right';
export type TableDirection = 'ltr' | 'rtl';

export interface TablesSetLayoutInput extends TableLocator {
  /**
   * Table preferred width in twips (1/1440 of an inch, 1/20 of a point).
   * Only applies to `fixedWidth` mode. Ignored when `autoFitMode` is `fitWindow`.
   */
  preferredWidth?: number;
  alignment?: TableAlignment;
  leftIndentPt?: number;
  autoFitMode?: TableAutoFitMode;
  tableDirection?: TableDirection;
}

// ---------------------------------------------------------------------------
// Row operations
// ---------------------------------------------------------------------------

export type RowInsertPosition = 'above' | 'below';

export interface TablesInsertRowInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  rowIndex?: number;
  position: RowInsertPosition;
  count?: number;
}

export type TablesDeleteRowInput = RowLocator | TableScopedRowLocator;

export interface TablesSetRowHeightInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  rowIndex?: number;
  heightPt: number;
  rule: 'atLeast' | 'exact' | 'auto';
}

/** Uses {@link TableLocator} directly as input. */
export type TablesDistributeRowsInput = TableLocator;

export interface TablesSetRowOptionsInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  tableTarget?: BlockNodeAddress;
  tableNodeId?: string;
  rowIndex?: number;
  allowBreakAcrossPages?: boolean;
  repeatHeader?: boolean;
}

// ---------------------------------------------------------------------------
// Column operations
// ---------------------------------------------------------------------------

export type ColumnInsertPosition = 'left' | 'right';

export interface TablesInsertColumnInput extends TableScopedColumnLocator {
  position: ColumnInsertPosition;
  count?: number;
}

export type TablesDeleteColumnInput = TableScopedColumnLocator;

export interface TablesSetColumnWidthInput extends TableScopedColumnLocator {
  widthPt: number;
}

export interface TablesDistributeColumnsInput extends TableLocator {
  columnRange?: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Cell operations
// ---------------------------------------------------------------------------

export type CellInsertMode = 'shiftRight' | 'shiftDown';
export type CellDeleteMode = 'shiftLeft' | 'shiftUp';

export interface TablesInsertCellInput extends CellLocator {
  mode: CellInsertMode;
}

export interface TablesDeleteCellInput extends CellLocator {
  mode: CellDeleteMode;
}

export type TablesMergeCellsInput = MergeRangeLocator;

export type TablesUnmergeCellsInput = CellLocator;

export interface TablesSplitCellInput extends CellLocator {
  rows: number;
  columns: number;
}

export interface TablesSetCellPropertiesInput extends CellLocator {
  preferredWidthPt?: number;
  verticalAlign?: 'top' | 'center' | 'bottom';
  wrapText?: boolean;
  fitText?: boolean;
}

// ---------------------------------------------------------------------------
// Data & accessibility
// ---------------------------------------------------------------------------

export type SortDirection = 'ascending' | 'descending';
export type SortType = 'text' | 'number' | 'date';

export interface TablesSortKey {
  columnIndex: number;
  direction: SortDirection;
  type: SortType;
}

export interface TablesSortInput extends TableLocator {
  keys: TablesSortKey[];
}

export interface TablesSetAltTextInput extends TableLocator {
  title?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Styling: table style
// ---------------------------------------------------------------------------

export interface TablesSetStyleInput extends TableLocator {
  styleId: string;
}

export type TablesClearStyleInput = TableLocator;

export type TableStyleOptionFlag =
  | 'headerRow'
  | 'totalRow'
  | 'firstColumn'
  | 'lastColumn'
  | 'bandedRows'
  | 'bandedColumns';

export interface TablesSetStyleOptionInput extends TableLocator {
  flag: TableStyleOptionFlag;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Styling: borders
// ---------------------------------------------------------------------------

export type BorderEdge = 'top' | 'bottom' | 'left' | 'right' | 'insideH' | 'insideV' | 'diagonalDown' | 'diagonalUp';

export interface TablesSetBorderInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  edge: BorderEdge;
  lineStyle: string;
  lineWeightPt: number;
  color: string;
}

export interface TablesClearBorderInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  edge: BorderEdge;
}

export type BorderPreset = 'box' | 'all' | 'none' | 'grid' | 'custom';

export interface TablesApplyBorderPresetInput extends TableLocator {
  preset: BorderPreset;
}

// ---------------------------------------------------------------------------
// Styling: shading
// ---------------------------------------------------------------------------

export interface TablesSetShadingInput {
  target?: BlockNodeAddress;
  nodeId?: string;
  color: string;
}

export interface TablesClearShadingInput {
  target?: BlockNodeAddress;
  nodeId?: string;
}

// ---------------------------------------------------------------------------
// Styling: padding & spacing
// ---------------------------------------------------------------------------

export interface TablesSetTablePaddingInput extends TableLocator {
  topPt: number;
  rightPt: number;
  bottomPt: number;
  leftPt: number;
}

export interface TablesSetCellPaddingInput extends CellLocator {
  topPt: number;
  rightPt: number;
  bottomPt: number;
  leftPt: number;
}

export interface TablesSetCellSpacingInput extends TableLocator {
  spacingPt: number;
}

export type TablesClearCellSpacingInput = TableLocator;

// ---------------------------------------------------------------------------
// Document-level style queries & mutations
// ---------------------------------------------------------------------------

/** Input for `tables.getStyles` — document-level query, no locator needed. */
export type TablesGetStylesInput = Record<string, never>;

/** Per-style metadata returned by `tables.getStyles`. */
export interface TableStyleInfo {
  id: string;
  name: string | null;
  basedOn: string | null;
  isDefault: boolean;
  isCustom: boolean;
  uiPriority: number | null;
  hidden: boolean;
  quickFormat: boolean;
  conditionalRegions: string[];
}

/** Output for `tables.getStyles`. */
export interface TablesGetStylesOutput {
  explicitDefaultStyleId: string | null;
  effectiveDefaultStyleId: string | null;
  effectiveDefaultSource: string;
  styles: TableStyleInfo[];
}

/** Input for `tables.setDefaultStyle`. */
export interface TablesSetDefaultStyleInput {
  styleId: string;
}

/** Input for `tables.clearDefaultStyle`. */
export type TablesClearDefaultStyleInput = Record<string, never>;

// ---------------------------------------------------------------------------
// Read operations (B4: ref handoff)
// ---------------------------------------------------------------------------

/** Input for `tables.get` — locates a single table. */
export type TablesGetInput = TableLocator;

/** Output for `tables.get` — table structure with stable refs. */
export interface TablesGetOutput {
  nodeId: string;
  address: BlockNodeAddress;
  rows: number;
  columns: number;
}

/** Input for `tables.getCells` — locates a table and optionally filters cells. */
export interface TablesGetCellsInput extends TableLocator {
  /** Optional row filter. */
  rowIndex?: number;
  /** Optional column filter. */
  columnIndex?: number;
}

/** Per-cell info with stable ref for write handoff. */
export interface TableCellInfo {
  nodeId: string;
  rowIndex: number;
  columnIndex: number;
  colspan: number;
  rowspan: number;
}

/** Output for `tables.getCells`. */
export interface TablesGetCellsOutput {
  tableNodeId: string;
  cells: TableCellInfo[];
}

/** Input for `tables.getProperties` — locates a single table. */
export type TablesGetPropertiesInput = TableLocator;

/** Output for `tables.getProperties` — table layout/style metadata. */
export interface TablesGetPropertiesOutput {
  nodeId: string;
  styleId?: string;
  alignment?: TableAlignment;
  direction?: TableDirection;
  /**
   * Table preferred width in twips (1/1440 of an inch, 1/20 of a point).
   * Only present for `fixedWidth` tables. Absent when `autoFitMode` is `fitWindow`.
   */
  preferredWidth?: number;
  autoFitMode?: TableAutoFitMode;
  styleOptions?: {
    headerRow?: boolean;
    totalRow?: boolean;
    firstColumn?: boolean;
    lastColumn?: boolean;
    bandedRows?: boolean;
    bandedColumns?: boolean;
  };
}
