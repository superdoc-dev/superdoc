import { describe, it, expect } from 'vitest';
import { preProcessVerticalMergeCells } from './pre-process-vertical-merge-cells.js';

const createMockSchema = () => ({
  nodes: {
    paragraph: {
      createAndFill: () => ({
        toJSON: () => ({ type: 'paragraph', content: [] }),
      }),
    },
  },
});

const createCell = (attrs = {}) => ({
  type: 'tableCell',
  attrs,
  content: [{ type: 'paragraph', content: [] }],
});

describe('preProcessVerticalMergeCells', () => {
  it('inserts continueMerge cells at the correct column when colspans differ', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [createCell({ colspan: 2 }), createCell({ colspan: 1, rowspan: 2 }), createCell({ colspan: 1 })],
        },
        {
          type: 'tableRow',
          content: [createCell({ colspan: 1 }), createCell({ colspan: 1 }), createCell({ colspan: 1 })],
        },
      ],
    };

    const processed = preProcessVerticalMergeCells(table, { editorSchema: createMockSchema() });
    const secondRow = processed.content[1];

    expect(secondRow.content).toHaveLength(4);
    expect(secondRow.content[2].attrs.continueMerge).toBe(true);
    expect(secondRow.content[2].attrs.colspan).toBe(1);
  });
});
