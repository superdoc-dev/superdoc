import { describe, it, expect } from 'vitest';

import { TableRow } from './table-row.js';

describe('TableRow attributes', () => {
  const attributes = TableRow.config.addAttributes.call(TableRow);

  it('omits row height style when value is missing', () => {
    expect(attributes.rowHeight.renderDOM({})).toEqual({});
    expect(attributes.rowHeight.renderDOM({ rowHeight: null })).toEqual({});
  });

  it('renders row height style in pixels', () => {
    expect(attributes.rowHeight.renderDOM({ rowHeight: 20 })).toEqual({
      style: 'height: 20px',
    });
  });

  it('parses inline row height in pt into tableRowProperties (twips)', () => {
    const tr = document.createElement('tr');
    tr.style.height = '15pt';

    expect(attributes.tableRowProperties.parseDOM(tr)).toEqual({
      rowHeight: {
        value: expect.closeTo(300, 5),
        rule: 'atLeast',
      },
    });
  });

  it('parses inline row height in px into tableRowProperties (twips)', () => {
    const tr = document.createElement('tr');
    tr.style.height = '30px';

    expect(attributes.tableRowProperties.parseDOM(tr)).toEqual({
      rowHeight: {
        value: 450,
        rule: 'atLeast',
      },
    });
  });

  it('falls back to min-height when height is missing', () => {
    const tr = document.createElement('tr');
    tr.style.minHeight = '12pt';

    expect(attributes.tableRowProperties.parseDOM(tr)).toEqual({
      rowHeight: {
        value: expect.closeTo(240, 5),
        rule: 'atLeast',
      },
    });
  });

  it('parses height attribute when styles are missing', () => {
    const tr = document.createElement('tr');
    tr.setAttribute('height', '24');

    expect(attributes.tableRowProperties.parseDOM(tr)).toEqual({
      rowHeight: {
        value: 360,
        rule: 'atLeast',
      },
    });
  });

  it('returns undefined when no supported height value is present', () => {
    const tr = document.createElement('tr');
    tr.style.height = 'auto';

    expect(attributes.tableRowProperties.parseDOM(tr)).toBeUndefined();
  });

  it('falls back to tallest td/th height when tr has no explicit height', () => {
    const tr = document.createElement('tr');
    const tdA = document.createElement('td');
    tdA.style.height = '10pt';
    const tdB = document.createElement('td');
    tdB.style.minHeight = '22px';
    tr.append(tdA, tdB);

    expect(attributes.tableRowProperties.parseDOM(tr)).toEqual({
      rowHeight: {
        value: 330,
        rule: 'atLeast',
      },
    });
  });
});
