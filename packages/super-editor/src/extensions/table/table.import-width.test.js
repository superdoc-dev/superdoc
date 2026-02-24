import { describe, it, expect } from 'vitest';

import { Table } from './table.js';

describe('Table import width defaults', () => {
  const attributes = Table.config.addAttributes.call(Table);

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
  });

  it('leaves non-imported tables unchanged', () => {
    const tableElement = {
      closest: () => null,
    };

    expect(attributes.tableProperties.parseDOM(tableElement)).toBeUndefined();
  });
});
