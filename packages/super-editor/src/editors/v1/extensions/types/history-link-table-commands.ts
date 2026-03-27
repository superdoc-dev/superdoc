export interface HistoryLinkTableCommandAugmentations {
  // History
  undo: () => boolean;
  redo: () => boolean;

  // Link
  setLink: (options?: { href?: string | null; text?: string | null }) => boolean;
  unsetLink: () => boolean;
  toggleLink: (options?: { href?: string | null; text?: string | null }) => boolean;

  // Table
  appendRowsWithContent: (options: {
    tablePos?: number | null;
    tableNode?: unknown;
    valueRows?: unknown[][];
    copyRowStyle?: boolean;
  }) => boolean;
  insertTable: (config?: { rows?: number; cols?: number; withHeaderRow?: boolean }) => boolean;
  deleteTable: () => boolean;
  addColumnBefore: () => boolean;
  addColumnAfter: () => boolean;
  deleteColumn: () => boolean;
  addRowBefore: () => boolean;
  addRowAfter: () => boolean;
  deleteRow: () => boolean;
  mergeCells: () => boolean;
  splitCell: () => boolean;
  splitSingleCell: () => boolean;
  mergeOrSplit: () => boolean;
  toggleHeaderColumn: () => boolean;
  toggleHeaderRow: () => boolean;
  toggleHeaderCell: () => boolean;
  setCellAttr: (name: string, value: unknown) => boolean;
  goToNextCell: () => boolean;
  goToPreviousCell: () => boolean;
  fixTables: () => boolean;
  setCellSelection: (pos: { anchorCell: number; headCell: number }) => boolean;
  setCellBackground: (value: string) => boolean;
  deleteCellAndTableBorders: () => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends HistoryLinkTableCommandAugmentations {}
}
