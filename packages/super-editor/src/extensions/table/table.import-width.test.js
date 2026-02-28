import { describe, it, expect } from 'vitest';

import { Table } from './table.js';

describe('Table import width defaults', () => {
  const attributes = Table.config.addAttributes.call(Table);

  it('keeps tableProperties as non-rendered metadata', () => {
    expect(attributes.tableProperties.rendered).toBe(false);
  });

  it('defaults imported HTML tables to 100% width', () => {
    const tableElement = {
      closest: (selector) => (selector === '[data-superdoc-import="true"]' ? {} : null),
    };

    expect(attributes.tableProperties.parseDOM(tableElement)).toEqual({
      tableWidth: {
        value: 5000,
        type: 'pct',
      },
    });
    expect(attributes.tableStyleId.parseDOM(tableElement)).toBe('TableGrid');
  });

  it('leaves non-imported tables unchanged', () => {
    const tableElement = {
      closest: () => null,
    };

    expect(attributes.tableProperties.parseDOM(tableElement)).toBeUndefined();
    expect(attributes.tableStyleId.parseDOM(tableElement)).toBeUndefined();
  });
});
