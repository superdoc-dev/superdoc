/**
 * Table Handler
 *
 * Manages table-specific layout behavior during editing, including
 * column width recalculation debouncing and cell edit tracking.
 *
 * Strategy:
 * 1. Track table states (column widths, row heights)
 * 2. Mark tables dirty on cell edits
 * 3. Debounce column width recalculation
 * 4. Provide table state for incremental layout
 *
 * @module table-handler
 */

/**
 * Layout state for a single table.
 */
export interface TableLayoutState {
  /** Table block index */
  tableIndex: number;
  /** Column widths in pixels */
  columnWidths: number[];
  /** Row heights in pixels */
  rowHeights: number[];
  /** Whether table needs recalculation */
  dirty: boolean;
}

/**
 * TableHandler manages table-specific layout optimizations.
 */
export class TableHandler {
  private tableStates: Map<number, TableLayoutState> = new Map();
  private columnRecalcDebounce: number = 100;
  private recalcTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Handle edit within a table cell.
   *
   * @param tableIndex - Block index of the table
   * @param cellIndex - Index of the edited cell
   */
  onCellEdit(tableIndex: number, _cellIndex: number): void {
    let state = this.tableStates.get(tableIndex);

    if (!state) {
      state = {
        tableIndex,
        columnWidths: [],
        rowHeights: [],
        dirty: true,
      };
      this.tableStates.set(tableIndex, state);
    } else {
      state.dirty = true;
    }

    // Debounce column recalculation
    this.scheduleColumnRecalc(tableIndex);
  }

  /**
   * Get table state for layout.
   *
   * @param tableIndex - Table block index
   * @returns Table state if exists, undefined otherwise
   */
  getTableState(tableIndex: number): TableLayoutState | undefined {
    return this.tableStates.get(tableIndex);
  }

  /**
   * Mark table columns for recalculation.
   *
   * @param tableIndex - Table block index
   */
  markColumnsDirty(tableIndex: number): void {
    const state = this.tableStates.get(tableIndex);
    if (state) {
      state.dirty = true;
    }
  }

  /**
   * Should column width recalculation be deferred?
   *
   * @returns True if recalculation is pending
   */
  shouldDeferColumnRecalc(): boolean {
    return this.recalcTimers.size > 0;
  }

  /**
   * Update table layout state after recalculation.
   *
   * @param tableIndex - Table block index
   * @param columnWidths - New column widths
   * @param rowHeights - New row heights
   */
  updateTableState(tableIndex: number, columnWidths: number[], rowHeights: number[]): void {
    const state = this.tableStates.get(tableIndex);
    if (state) {
      state.columnWidths = columnWidths;
      state.rowHeights = rowHeights;
      state.dirty = false;
    } else {
      this.tableStates.set(tableIndex, {
        tableIndex,
        columnWidths,
        rowHeights,
        dirty: false,
      });
    }
  }

  /**
   * Clear all table states.
   */
  clear(): void {
    // Cancel all pending recalculations
    for (const timer of this.recalcTimers.values()) {
      clearTimeout(timer);
    }
    this.recalcTimers.clear();
    this.tableStates.clear();
  }

  /**
   * Get all dirty table indices.
   *
   * @returns Array of table indices needing recalculation
   */
  getDirtyTables(): number[] {
    const dirty: number[] = [];
    for (const [index, state] of this.tableStates) {
      if (state.dirty) {
        dirty.push(index);
      }
    }
    return dirty;
  }

  /**
   * Schedule column width recalculation with debouncing.
   *
   * @param tableIndex - Table block index
   * @private
   */
  private scheduleColumnRecalc(tableIndex: number): void {
    // Clear existing timer
    const existingTimer = this.recalcTimers.get(tableIndex);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.recalcTimers.delete(tableIndex);
      // Actual recalculation would be triggered here
      // In practice, this would emit an event or call a callback
    }, this.columnRecalcDebounce);

    this.recalcTimers.set(tableIndex, timer);
  }
}
