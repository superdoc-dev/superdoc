// @ts-check
import { describe, it, expect } from 'vitest';
import { normalizeTableRowChildren } from './table-row-children.js';

const SDT_PR = { name: 'w:sdtPr', elements: [{ name: 'w:id', attributes: { 'w:val': '849213029' } }] };
const SDT_END_PR = { name: 'w:sdtEndPr', elements: [] };
const FIRST_ROW = { name: 'w:tr', elements: [{ name: 'w:tc', elements: [] }] };
const SECOND_ROW = { name: 'w:tr', elements: [{ name: 'w:tc', elements: [] }] };
const BOOKMARK_START = { name: 'w:bookmarkStart', attributes: { 'w:id': '1', 'w:name': 'row-start' } };
const BOOKMARK_END = { name: 'w:bookmarkEnd', attributes: { 'w:id': '1' } };

describe('normalizeTableRowChildren', () => {
  it('emits direct table rows unchanged', () => {
    const table = { name: 'w:tbl', elements: [FIRST_ROW] };

    expect(normalizeTableRowChildren(table)).toEqual([{ node: FIRST_ROW, rowSdt: null }]);
  });

  it('unwraps a single-row row-level SDT and preserves wrapper metadata', () => {
    const table = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:sdt',
          elements: [SDT_PR, SDT_END_PR, { name: 'w:sdtContent', elements: [FIRST_ROW] }],
        },
      ],
    };

    expect(normalizeTableRowChildren(table)).toEqual([
      {
        node: FIRST_ROW,
        rowSdt: { scope: 'row', sdtPr: SDT_PR, sdtEndPr: SDT_END_PR },
      },
    ]);
  });

  it('preserves non-row SDT content siblings around a single imported row', () => {
    const table = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:sdt',
          elements: [SDT_PR, { name: 'w:sdtContent', elements: [BOOKMARK_START, FIRST_ROW, BOOKMARK_END] }],
        },
      ],
    };

    expect(normalizeTableRowChildren(table)).toEqual([
      {
        node: FIRST_ROW,
        rowSdt: {
          scope: 'row',
          sdtPr: SDT_PR,
          sdtEndPr: null,
          contentBefore: [BOOKMARK_START],
          contentAfter: [BOOKMARK_END],
        },
      },
    ]);
  });

  it('imports multi-row wrappers without applying wrapper metadata to individual rows', () => {
    const table = {
      name: 'w:tbl',
      elements: [
        {
          name: 'w:sdt',
          elements: [SDT_PR, { name: 'w:sdtContent', elements: [FIRST_ROW, SECOND_ROW] }],
        },
      ],
    };

    expect(normalizeTableRowChildren(table)).toEqual([
      { node: FIRST_ROW, rowSdt: null },
      { node: SECOND_ROW, rowSdt: null },
    ]);
  });

  it('skips row-level SDTs without row content', () => {
    const table = { name: 'w:tbl', elements: [{ name: 'w:sdt', elements: [SDT_PR] }] };

    expect(normalizeTableRowChildren(table)).toEqual([]);
  });
});
