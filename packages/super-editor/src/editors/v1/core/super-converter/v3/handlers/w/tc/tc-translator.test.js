import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the helper modules used by tc-translator
vi.mock('./helpers/legacy-handle-table-cell-node', () => ({
  handleTableCellNode: vi.fn(() => ({ type: 'tableCell', content: [], attrs: { a: 1 } })),
}));
vi.mock('./helpers/translate-table-cell', () => ({
  translateTableCell: vi.fn(() => ({ name: 'w:tc', elements: [{ name: 'w:tcPr', elements: [] }] })),
}));

import { config, translator } from './tc-translator.js';
import { NodeTranslator } from '../../../node-translator/node-translator.js';
import { handleTableCellNode } from './helpers/legacy-handle-table-cell-node';
import { translateTableCell } from './helpers/translate-table-cell';

describe('w:tc translator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct config meta', () => {
    expect(config.xmlName).toBe('w:tc');
    expect(config.sdNodeOrKeyName).toBe('tableCell');
    expect(typeof config.encode).toBe('function');
    expect(typeof config.decode).toBe('function');
  });

  it('builds NodeTranslator instance', () => {
    expect(translator).toBeInstanceOf(NodeTranslator);
    expect(translator.xmlName).toBe('w:tc');
    expect(translator.sdNodeOrKeyName).toBe('tableCell');
  });

  it('keeps legacy paraId handlers for import compatibility', () => {
    const paraIdHandler = translator.attributes.find((attr) => attr.sdName === 'paraId');
    expect(paraIdHandler?.xmlName).toBe('w14:paraId');
  });

  it('encode calls legacy handler and merges encodedAttrs into result attrs', () => {
    const params = { extraParams: { node: {}, table: {}, row: {} } };
    const res = config.encode(params, { extra: 'ok' });

    expect(handleTableCellNode).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ type: 'tableCell' });
    expect(res.attrs).toMatchObject({ a: 1, extra: 'ok' });
  });

  it('decode calls translateTableCell and merges decodedAttrs into attributes', () => {
    const params = { node: { type: 'tableCell', attrs: {} } };
    const out = config.decode(params, { 'w:foo': 'bar' });

    expect(translateTableCell).toHaveBeenCalledTimes(1);
    expect(out.name).toBe('w:tc');
    expect(out.attributes).toMatchObject({ 'w:foo': 'bar' });
  });

  it('drops legacy w14 cell identity attributes on export', () => {
    const params = { node: { type: 'tableCell', attrs: {} } };
    const out = config.decode(params, { 'w14:paraId': 'ABCDEF01', 'w14:textId': 'ABCDEF02' });

    expect(translateTableCell).toHaveBeenCalledTimes(1);
    expect(out.name).toBe('w:tc');
    expect(out.attributes).toBeUndefined();
  });
});
