import { describe, it, expect } from 'vitest';
import { normalizeDuplicateBlockIdentitiesInContent } from './normalizeDuplicateBlockIdentitiesInContent.js';

describe('normalizeDuplicateBlockIdentitiesInContent', () => {
  const paragraph = (attrs = {}, text = 'text') => ({
    type: 'paragraph',
    attrs,
    marks: [],
    content: [{ type: 'text', text, marks: [] }],
  });

  const table = (content = [], attrs = {}) => ({ type: 'table', attrs, marks: [], content });
  const row = (content = [], attrs = {}) => ({ type: 'tableRow', attrs, marks: [], content });
  const cell = (content = [], attrs = {}) => ({ type: 'tableCell', attrs, marks: [], content });
  const image = (attrs = {}) => ({ type: 'image', attrs, marks: [] });

  it('deduplicates duplicate paraId values while keeping the first occurrence unchanged', () => {
    const content = [paragraph({ paraId: 'DUPLICATE' }, 'A'), paragraph({ paraId: 'DUPLICATE' }, 'B')];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.paraId).toBe('DUPLICATE');
    expect(content[1].attrs.paraId).not.toBe('DUPLICATE');
    expect(content[1].attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
  });

  it('rewrites the field that actually provided the identity (sdBlockId fallback for paragraph)', () => {
    const content = [paragraph({ sdBlockId: 'SAME' }, 'A'), paragraph({ sdBlockId: 'SAME' }, 'B')];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.sdBlockId).toBe('SAME');
    expect(content[1].attrs.sdBlockId).not.toBe('SAME');
    expect(content[1].attrs.sdBlockId).toMatch(/^[0-9A-F]{8}$/);
    expect(content[1].attrs.paraId).toBeUndefined();
  });

  it('synthesizes deterministic paraId values for paragraphs missing stable identities', () => {
    const firstImport = [paragraph({}, 'A'), paragraph({}, 'B')];
    const secondImport = [paragraph({}, 'A'), paragraph({}, 'B')];

    normalizeDuplicateBlockIdentitiesInContent(firstImport);
    normalizeDuplicateBlockIdentitiesInContent(secondImport);

    const firstIds = firstImport.map((node) => node.attrs.paraId);
    const secondIds = secondImport.map((node) => node.attrs.paraId);

    expect(firstIds).toEqual(secondIds);
    expect(firstIds[0]).toMatch(/^[0-9A-F]{8}$/);
    expect(firstIds[1]).toMatch(/^[0-9A-F]{8}$/);
    expect(firstIds[0]).not.toBe(firstIds[1]);
  });

  it('reserves explicit ids before synthesizing paraIds for earlier missing blocks', () => {
    const content = [paragraph({}, 'Missing ID'), paragraph({ paraId: '00000001' }, 'Explicit ID')];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
    expect(content[0].attrs.paraId).not.toBe('00000001');
    expect(content[1].attrs.paraId).toBe('00000001');
  });

  it('reserves explicit paraIds even when sdBlockId is the primary paragraph identity', () => {
    const content = [paragraph({}, 'Missing ID'), paragraph({ sdBlockId: 'X', paraId: '00000001' }, 'Explicit ParaId')];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
    expect(content[0].attrs.paraId).not.toBe('00000001');
    expect(content[1].attrs.sdBlockId).toBe('X');
    expect(content[1].attrs.paraId).toBe('00000001');
  });

  it('prioritizes sdBlockId over paraId when both are present on paragraphs', () => {
    const content = [
      paragraph({ paraId: 'P1', sdBlockId: 'SAME' }, 'A'),
      paragraph({ paraId: 'P2', sdBlockId: 'SAME' }, 'B'),
    ];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.sdBlockId).toBe('SAME');
    expect(content[1].attrs.sdBlockId).not.toBe('SAME');
    expect(content[1].attrs.sdBlockId).toMatch(/^[0-9A-F]{8}$/);
    expect(content[0].attrs.paraId).toBe('P1');
    expect(content[1].attrs.paraId).toBe('P2');
  });

  it('deduplicates explicit paraIds even when sdBlockIds are distinct', () => {
    const content = [
      paragraph({ sdBlockId: 'A', paraId: 'DUPLICATE' }, 'A'),
      paragraph({ sdBlockId: 'B', paraId: 'DUPLICATE' }, 'B'),
    ];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.sdBlockId).toBe('A');
    expect(content[1].attrs.sdBlockId).toBe('B');
    expect(content[0].attrs.paraId).toBe('DUPLICATE');
    expect(content[1].attrs.paraId).not.toBe('DUPLICATE');
    expect(content[1].attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
  });

  it('deduplicates table blockId when paraId/sdBlockId are not present', () => {
    const content = [table([], { blockId: 'TABLE-ID' }), table([], { blockId: 'TABLE-ID' })];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.blockId).toBe('TABLE-ID');
    expect(content[1].attrs.blockId).not.toBe('TABLE-ID');
    expect(content[1].attrs.blockId).toMatch(/^[0-9A-F]{8}$/);
  });

  it('does not rewrite non-block identity fields (e.g. image attrs.id)', () => {
    const content = [image({ id: '42', src: 'a.png' }), image({ id: '42', src: 'b.png' })];

    normalizeDuplicateBlockIdentitiesInContent(content);

    expect(content[0].attrs.id).toBe('42');
    expect(content[1].attrs.id).toBe('42');
  });

  it('deduplicates identities across nested table block nodes', () => {
    const content = [
      table(
        [
          row(
            [
              cell([paragraph({ paraId: 'CELLPARA' }, 'R1C1')], { paraId: 'CELLID' }),
              cell([paragraph({ paraId: 'CELLPARA' }, 'R1C2')], { paraId: 'CELLID' }),
            ],
            { paraId: 'ROWID' },
          ),
          row([cell([paragraph({ paraId: 'ROWID' }, 'R2C1')], { paraId: 'CELLID' })], { paraId: 'ROWID' }),
        ],
        { paraId: 'TABLEID' },
      ),
    ];

    normalizeDuplicateBlockIdentitiesInContent(content);

    const identities = new Set();
    const duplicates = new Set();
    const collect = (node) => {
      if (!node || typeof node !== 'object') return;
      const attrs = node.attrs ?? {};
      const nodeIds = new Set(
        [attrs.paraId, attrs.sdBlockId, attrs.blockId, attrs.id, attrs.uuid].filter(
          (value) => typeof value === 'string' && value.length > 0,
        ),
      );
      for (const id of nodeIds) {
        if (identities.has(id)) duplicates.add(id);
        identities.add(id);
      }
      if (Array.isArray(node.content)) node.content.forEach(collect);
    };

    content.forEach(collect);
    expect(duplicates.size).toBe(0);
  });

  it('synthesizes paraIds only for schema-valid paragraph and row nodes', () => {
    const content = [table([row([cell([paragraph({}, 'R1C1')], {}), cell([paragraph({}, 'R1C2')], {})])], {})];

    normalizeDuplicateBlockIdentitiesInContent(content);

    const tableNode = content[0];
    const rowNode = tableNode.content[0];
    const firstCell = rowNode.content[0];
    const secondCell = rowNode.content[1];

    expect(tableNode.attrs.paraId).toBeUndefined();
    expect(firstCell.attrs.paraId).toBeUndefined();
    expect(secondCell.attrs.paraId).toBeUndefined();

    expect(rowNode.attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
    expect(firstCell.content[0].attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
    expect(secondCell.content[0].attrs.paraId).toMatch(/^[0-9A-F]{8}$/);
    expect(
      new Set([rowNode.attrs.paraId, firstCell.content[0].attrs.paraId, secondCell.content[0].attrs.paraId]).size,
    ).toBe(3);
  });
});
