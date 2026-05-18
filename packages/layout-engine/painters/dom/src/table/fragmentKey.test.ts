import { describe, expect, it } from 'vitest';
import type { TableFragment } from '@superdoc/contracts';
import { tableFragmentKey } from './fragmentKey.js';

describe('tableFragmentKey', () => {
  it('preserves full-row table fragment key format', () => {
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 'table-a',
      fromRow: 1,
      toRow: 3,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    };

    expect(tableFragmentKey(fragment)).toBe('table:table-a:1:3');
  });

  it('preserves partial-row table fragment key format byte-for-byte', () => {
    const fragment: TableFragment = {
      kind: 'table',
      blockId: 'table-a',
      fromRow: 2,
      toRow: 4,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      partialRow: {
        rowIndex: 2,
        fromLineByCell: [0, 2, 4],
        toLineByCell: [1, 3, 5],
        partialHeight: 25,
      },
    };

    expect(tableFragmentKey(fragment)).toBe('table:table-a:2:4:0,2,4-1,3,5');
  });
});
