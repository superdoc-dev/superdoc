import { describe, it, expect } from 'vitest';
import { normalizeTablesSplitInput } from './tables.js';

describe('normalizeTablesSplitInput', () => {
  it('passes through canonical rowIndex unchanged', () => {
    const input = { nodeId: 'table-1', rowIndex: 2 };
    expect(normalizeTablesSplitInput(input)).toEqual(input);
  });

  it('maps legacy atRowIndex to rowIndex', () => {
    const input = { nodeId: 'table-1', atRowIndex: 3 };
    const result = normalizeTablesSplitInput(input);
    expect(result).toEqual({ nodeId: 'table-1', rowIndex: 3 });
    expect(result).not.toHaveProperty('atRowIndex');
  });

  it('accepts both when values match (prefers rowIndex)', () => {
    const input = { nodeId: 'table-1', rowIndex: 1, atRowIndex: 1 };
    const result = normalizeTablesSplitInput(input);
    expect(result).toEqual({ nodeId: 'table-1', rowIndex: 1 });
    expect(result).not.toHaveProperty('atRowIndex');
  });

  it('rejects conflicting rowIndex and atRowIndex', () => {
    const input = { nodeId: 'table-1', rowIndex: 1, atRowIndex: 2 };
    expect(() => normalizeTablesSplitInput(input)).toThrow(
      'tables.split: cannot provide both rowIndex and atRowIndex with different values.',
    );
  });

  it('preserves all other input fields', () => {
    const input = { nodeId: 'table-1', atRowIndex: 1, target: undefined };
    const result = normalizeTablesSplitInput(input);
    expect(result.nodeId).toBe('table-1');
    expect(result.rowIndex).toBe(1);
  });
});
