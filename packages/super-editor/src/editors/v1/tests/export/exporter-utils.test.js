import { describe, it, expect } from 'vitest';
import { isLineBreakOnlyRun, processOutputMarks, exportSchemaToJson } from '@converter/exporter.js';

describe('isLineBreakOnlyRun', () => {
  it('returns true for a run containing only line break nodes', () => {
    const runNode = {
      type: 'run',
      content: [
        { type: 'lineBreak', attrs: {} },
        { type: 'hardBreak', attrs: {} },
      ],
    };

    expect(isLineBreakOnlyRun(runNode)).toBe(true);
  });

  it('returns false when run contains non-break content', () => {
    const runNode = {
      type: 'run',
      content: [
        { type: 'lineBreak', attrs: {} },
        { type: 'text', text: 'content' },
      ],
    };

    expect(isLineBreakOnlyRun(runNode)).toBe(false);
  });

  it('returns false for empty runs', () => {
    expect(isLineBreakOnlyRun({ type: 'run', content: [] })).toBe(false);
  });
});

describe('processOutputMarks', () => {
  it('maps inherit color to auto to negate style colors', () => {
    const marks = [{ type: 'textStyle', attrs: { color: 'inherit' } }];

    const result = processOutputMarks(marks);

    expect(result).toEqual([
      {
        name: 'w:color',
        attributes: { 'w:val': 'auto' },
      },
    ]);
  });
});

describe('exportSchemaToJson', () => {
  it('routes tableHeader nodes to the table cell translator (SD-1709)', () => {
    const tableHeaderNode = {
      type: 'tableHeader',
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: [100],
      },
      content: [
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };

    const result = exportSchemaToJson({ node: tableHeaderNode });

    // tableHeader should be exported as w:tc (same as tableCell)
    expect(result).not.toBeNull();
    expect(result.name).toBe('w:tc');
  });

  it('routes tableCell nodes to the table cell translator', () => {
    const tableCellNode = {
      type: 'tableCell',
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: [100],
      },
      content: [
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };

    const result = exportSchemaToJson({ node: tableCellNode });

    expect(result).not.toBeNull();
    expect(result.name).toBe('w:tc');
  });
});
