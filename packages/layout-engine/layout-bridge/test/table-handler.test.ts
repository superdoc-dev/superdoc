/**
 * Tests for TableHandler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vite-plus/test';
import { TableHandler } from '../src/table-handler';

describe('TableHandler', () => {
  let handler: TableHandler;

  beforeEach(() => {
    handler = new TableHandler();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('onCellEdit', () => {
    it('should mark table as dirty', () => {
      handler.onCellEdit(0, 5);

      const state = handler.getTableState(0);
      expect(state?.dirty).toBe(true);
    });

    it('should create state for new table', () => {
      handler.onCellEdit(0, 5);

      const state = handler.getTableState(0);
      expect(state).toBeDefined();
      expect(state?.tableIndex).toBe(0);
    });
  });

  describe('markColumnsDirty', () => {
    it('should mark existing table dirty', () => {
      handler.onCellEdit(0, 5);
      handler.updateTableState(0, [100, 200], [50, 50]);

      handler.markColumnsDirty(0);

      const state = handler.getTableState(0);
      expect(state?.dirty).toBe(true);
    });
  });

  describe('updateTableState', () => {
    it('should update table dimensions', () => {
      handler.updateTableState(0, [100, 200, 150], [50, 60]);

      const state = handler.getTableState(0);
      expect(state?.columnWidths).toEqual([100, 200, 150]);
      expect(state?.rowHeights).toEqual([50, 60]);
      expect(state?.dirty).toBe(false);
    });
  });

  describe('getDirtyTables', () => {
    it('should return dirty table indices', () => {
      handler.onCellEdit(0, 1);
      handler.onCellEdit(2, 3);
      handler.updateTableState(1, [], []);

      const dirty = handler.getDirtyTables();
      expect(dirty).toContain(0);
      expect(dirty).toContain(2);
      expect(dirty).not.toContain(1);
    });
  });

  describe('clear', () => {
    it('should clear all states', () => {
      handler.onCellEdit(0, 1);
      handler.onCellEdit(1, 2);

      handler.clear();

      expect(handler.getTableState(0)).toBeUndefined();
      expect(handler.getDirtyTables()).toHaveLength(0);
    });
  });
});
