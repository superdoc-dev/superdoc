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
      const id =
        (typeof attrs.paraId === 'string' && attrs.paraId) ||
        (typeof attrs.sdBlockId === 'string' && attrs.sdBlockId) ||
        (typeof attrs.blockId === 'string' && attrs.blockId) ||
        (typeof attrs.id === 'string' && attrs.id) ||
        (typeof attrs.uuid === 'string' && attrs.uuid);
      if (id) {
        if (identities.has(id)) duplicates.add(id);
        identities.add(id);
      }
      if (Array.isArray(node.content)) node.content.forEach(collect);
    };

    content.forEach(collect);
    expect(duplicates.size).toBe(0);
  });
});
