import { describe, it, expect } from 'vitest';

import { TableCell } from './table-cell.js';

describe('TableCell verticalAlign renderDOM', () => {
  const attributes = TableCell.config.addAttributes.call(TableCell);

  it('omits style when verticalAlign is not provided', () => {
    expect(attributes.verticalAlign.renderDOM({})).toEqual({});
    expect(attributes.verticalAlign.renderDOM({ verticalAlign: null })).toEqual({});
  });

  it('adds vertical-align style when attribute is set', () => {
    expect(attributes.verticalAlign.renderDOM({ verticalAlign: 'bottom' })).toEqual({
      style: 'vertical-align: bottom',
    });
  });
});
