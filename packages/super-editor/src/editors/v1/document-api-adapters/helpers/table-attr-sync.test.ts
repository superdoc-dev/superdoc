import { describe, expect, it } from 'vitest';
import { buildWidthAuthoringTableAttrs } from './table-attr-sync.js';

describe('buildWidthAuthoringTableAttrs', () => {
  it('recomputes nested tableWidth from the authored grid', () => {
    const result = buildWidthAuthoringTableAttrs(
      {
        tableProperties: {
          tableLayout: 'autofit',
          tableWidth: { value: 7200, type: 'dxa' },
        },
        tableWidth: { width: 480, type: 'dxa' },
        grid: [{ col: 1200 }, { col: 3000 }],
      },
      {
        grid: [{ col: 1800 }, { col: 3000 }],
      },
    );

    expect(result.tableProperties).toMatchObject({
      tableLayout: 'fixed',
      tableWidth: { value: 4800, type: 'dxa' },
    });
    expect(result.tableWidth).toEqual({ width: 320, type: 'dxa' });
  });

  it('clears stale tableWidth when width authoring has no grid-backed replacement', () => {
    const result = buildWidthAuthoringTableAttrs({
      tableProperties: {
        tableLayout: 'autofit',
        tableWidth: { value: 7200, type: 'dxa' },
      },
      tableWidth: { width: 480, type: 'dxa' },
    });

    expect(result.tableProperties).toMatchObject({ tableLayout: 'fixed' });
    expect((result.tableProperties as Record<string, unknown>).tableWidth).toBeUndefined();
    expect(result.tableWidth).toBeNull();
  });

  it('preserves promoted tableCellSpacing in the importer-compatible value shape', () => {
    const result = buildWidthAuthoringTableAttrs({
      tableProperties: {
        tableLayout: 'autofit',
        tableCellSpacing: { value: 30, type: 'dxa' },
      },
      grid: [{ col: 1200 }, { col: 3000 }],
    });

    expect(result.tableProperties).toMatchObject({
      tableLayout: 'fixed',
      tableCellSpacing: { value: 30, type: 'dxa' },
    });
    expect(result.tableCellSpacing).toEqual({ value: 2, type: 'dxa' });
    expect(result.borderCollapse).toBe('separate');
  });
});
