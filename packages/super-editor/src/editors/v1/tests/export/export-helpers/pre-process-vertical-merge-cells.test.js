import { describe, it, expect } from 'vitest';
import { preProcessVerticalMergeCells } from '../../../core/super-converter/export-helpers/pre-process-vertical-merge-cells.js';

const paragraphJSON = { type: 'paragraph', content: [] };
const editorSchema = {
  nodes: {
    paragraph: {
      createAndFill() {
        return {
          toJSON() {
            return paragraphJSON;
          },
        };
      },
    },
  },
};

describe('preProcessVerticalMergeCells', () => {
  it('preserves rows with missing content and inserts merge placeholders', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { rowspan: 2, colspan: 3, colwidth: [100, 173, 312] },
              content: [],
            },
          ],
        },
        {
          type: 'tableRow',
          attrs: {},
          // no content field to mimic malformed row
        },
      ],
    };

    const { content: processedRows } = preProcessVerticalMergeCells(table, { editorSchema });

    expect(processedRows).toHaveLength(2);

    const secondRow = processedRows[1];
    expect(Array.isArray(secondRow.content)).toBe(true);
    expect(secondRow.content).toHaveLength(1);

    const placeholder = secondRow.content[0];
    expect(placeholder.attrs?.continueMerge).toBe(true);
    expect(placeholder.attrs?.colspan).toBe(3);
    expect(placeholder.attrs?.rowspan).toBeNull();
    expect(placeholder.attrs?.colwidth).toEqual([100, 173, 312]);
    expect(placeholder.content[0]).toBe(paragraphJSON);
  });

  it('does not duplicate merge placeholders when run multiple times', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { rowspan: 3 },
              content: [],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [],
        },
        {
          type: 'tableRow',
          content: [],
        },
      ],
    };

    preProcessVerticalMergeCells(table, { editorSchema });
    preProcessVerticalMergeCells(table, { editorSchema });

    const [, secondRow, thirdRow] = table.content;

    expect(secondRow.content).toHaveLength(1);
    expect(secondRow.content[0].attrs?.continueMerge).toBe(true);

    expect(thirdRow.content).toHaveLength(1);
    expect(thirdRow.content[0].attrs?.continueMerge).toBe(true);
  });

  it('inserts merge placeholders at the correct index when rows already have cells', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: {},
              content: [],
            },
            {
              type: 'tableCell',
              attrs: { rowspan: 2, colspan: 2, colwidth: [120, 120] },
              content: [],
            },
            {
              type: 'tableCell',
              attrs: {},
              content: [],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { label: 'existing-left' },
              content: [],
            },
            {
              type: 'tableCell',
              attrs: { label: 'existing-right' },
              content: [],
            },
          ],
        },
      ],
    };

    preProcessVerticalMergeCells(table, { editorSchema });

    const secondRow = table.content[1];

    expect(secondRow.content).toHaveLength(3);
    expect(secondRow.content[1].attrs?.continueMerge).toBe(true);
    expect(secondRow.content[1].attrs?.colspan).toBe(2);
    expect(secondRow.content[1].attrs?.colwidth).toEqual([120, 120]);
    expect(secondRow.content[1].attrs?.rowspan).toBeNull();
    expect(secondRow.content[1].content[0]).toBe(paragraphJSON);
    expect(secondRow.content[2].attrs?.label).toBe('existing-right');
  });

  it('clamps rowspans to available rows', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { rowspan: 10 },
              content: [],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [],
        },
        {
          type: 'tableRow',
          content: [],
        },
      ],
    };

    preProcessVerticalMergeCells(table, { editorSchema });

    expect(table.content[1].content).toHaveLength(1);
    expect(table.content[1].content[0].attrs?.continueMerge).toBe(true);
    expect(table.content[2].content).toHaveLength(1);
    expect(table.content[2].content[0].attrs?.continueMerge).toBe(true);
  });

  it('creates placeholders for multiple vertically merged columns', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { rowspan: 3, colwidth: [140] },
              content: [],
            },
            {
              type: 'tableCell',
              attrs: { rowspan: 2, colwidth: [210] },
              content: [],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [],
        },
        {
          type: 'tableRow',
          content: [],
        },
      ],
    };

    preProcessVerticalMergeCells(table, { editorSchema });

    const secondRow = table.content[1];
    const thirdRow = table.content[2];

    expect(secondRow.content).toHaveLength(2);
    expect(secondRow.content[0].attrs?.continueMerge).toBe(true);
    expect(secondRow.content[0].attrs?.colwidth).toEqual([140]);
    expect(secondRow.content[0].content[0]).toBe(paragraphJSON);
    expect(secondRow.content[1].attrs?.continueMerge).toBe(true);
    expect(secondRow.content[1].attrs?.colwidth).toEqual([210]);
    expect(secondRow.content[1].content[0]).toBe(paragraphJSON);

    expect(thirdRow.content).toHaveLength(1);
    expect(thirdRow.content[0].attrs?.continueMerge).toBe(true);
    expect(thirdRow.content[0].attrs?.colwidth).toEqual([140]);
    expect(thirdRow.content[0].content[0]).toBe(paragraphJSON);
  });
});
