import { describe, expect, it } from 'vitest';
import { buildTableInput } from './register-executors.js';

describe('buildTableInput', () => {
  it('routes row ops with rowIndex to nodeId', () => {
    const result = buildTableInput('tables.insertRow', 'table-1', { rowIndex: 2, position: 'after' });
    expect(result).toEqual({ nodeId: 'table-1', rowIndex: 2, position: 'after' });
  });

  it('routes row ops without rowIndex to a direct row target', () => {
    const result = buildTableInput('tables.insertRow', 'row-1', { position: 'after' });
    expect(result).toEqual({
      target: { kind: 'block', nodeType: 'tableRow', nodeId: 'row-1' },
      position: 'after',
    });
  });

  it('routes tables.deleteRow without rowIndex to a direct row target', () => {
    const result = buildTableInput('tables.deleteRow', 'row-1', {});
    expect(result).toEqual({ target: { kind: 'block', nodeType: 'tableRow', nodeId: 'row-1' } });
  });

  it('routes tables.setRowHeight without rowIndex to a direct row target', () => {
    const result = buildTableInput('tables.setRowHeight', 'row-1', { heightPt: 30 });
    expect(result).toEqual({
      target: { kind: 'block', nodeType: 'tableRow', nodeId: 'row-1' },
      heightPt: 30,
    });
  });

  it('routes tables.setRowOptions without rowIndex to a direct row target', () => {
    const result = buildTableInput('tables.setRowOptions', 'row-1', { cantSplit: true });
    expect(result).toEqual({
      target: { kind: 'block', nodeType: 'tableRow', nodeId: 'row-1' },
      cantSplit: true,
    });
  });

  it('routes column ops to nodeId', () => {
    const result = buildTableInput('tables.insertColumn', 'table-1', { columnIndex: 1 });
    expect(result).toEqual({ nodeId: 'table-1', columnIndex: 1 });
  });

  it('routes mergeCells to nodeId', () => {
    const result = buildTableInput('tables.mergeCells', 'table-1', {
      startRow: 0,
      startColumn: 0,
      endRow: 1,
      endColumn: 1,
    });
    expect(result).toEqual({
      nodeId: 'table-1',
      startRow: 0,
      startColumn: 0,
      endRow: 1,
      endColumn: 1,
    });
  });

  it('routes non-scoped table ops to nodeId', () => {
    const result = buildTableInput('tables.delete', 'table-1', {});
    expect(result).toEqual({ nodeId: 'table-1' });
  });

  it('strips pre-existing locator fields from args', () => {
    const result = buildTableInput('tables.delete', 'table-1', {
      target: 'stale',
      nodeId: 'stale',
      extra: 'kept',
    });
    expect(result).toEqual({ nodeId: 'table-1', extra: 'kept' });
  });
});
