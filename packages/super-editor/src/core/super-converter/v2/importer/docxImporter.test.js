import { describe, it, expect } from 'vitest';
import {
  collapseWhitespaceNextToInlinePassthrough,
  filterOutRootInlineNodes,
  normalizeTableBookmarksInContent,
} from './docxImporter.js';

const n = (type, attrs = {}) => ({ type, attrs, marks: [] });

describe('filterOutRootInlineNodes', () => {
  it('removes inline nodes at the root and keeps block nodes', () => {
    const input = [
      n('text'),
      n('bookmarkStart', { id: '1', name: 'bm' }),
      n('bookmarkEnd', { id: '1' }),
      n('paragraph'),
      n('lineBreak'),
      n('table'),
      n('pageNumber'),
      n('totalPageCount'),
      n('runItem'),
      n('image'),
      n('tab'),
      n('fieldAnnotation'),
      n('mention'),
      n('contentBlock'),
      n('aiLoaderNode'),
      n('commentRangeStart'),
      n('commentRangeEnd'),
      n('commentReference'),
      n('structuredContent'),
    ];

    const result = filterOutRootInlineNodes(input);
    const types = result.map((x) => x.type);

    expect(types).toEqual(['passthroughBlock', 'passthroughBlock', 'paragraph', 'table']);
    const [startPassthrough, endPassthrough] = result;
    expect(startPassthrough.attrs.originalXml).toMatchObject({
      name: 'w:bookmarkStart',
      attributes: { 'w:id': '1', 'w:name': 'bm' },
    });
    expect(endPassthrough.attrs.originalXml).toMatchObject({
      name: 'w:bookmarkEnd',
      attributes: { 'w:id': '1' },
    });
  });

  it('returns an empty array when only inline nodes are provided', () => {
    const input = [
      n('text'),
      n('bookmarkStart', { id: '2' }),
      n('bookmarkEnd', { id: '2' }),
      n('lineBreak'),
      n('mention'),
    ];
    const result = filterOutRootInlineNodes(input);
    expect(result.map((n) => n.type)).toEqual(['passthroughBlock', 'passthroughBlock']);
  });

  it('returns the same array when there are no inline nodes', () => {
    const input = [n('paragraph'), n('table')];
    const result = filterOutRootInlineNodes(input);
    expect(result).toEqual(input);
  });

  it('handles empty input gracefully', () => {
    expect(filterOutRootInlineNodes([])).toEqual([]);
  });

  it('wraps anchored images in a paragraph node', () => {
    const anchoredImage = { type: 'image', attrs: { isAnchor: true, src: 'test.png' }, marks: [] };
    const inlineImage = { type: 'image', attrs: { isAnchor: false, src: 'inline.png' }, marks: [] };
    const input = [anchoredImage, inlineImage, n('paragraph')];

    const result = filterOutRootInlineNodes(input);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('paragraph');
    expect(result[0].content).toEqual([anchoredImage]);
    expect(result[0].attrs).toEqual({});
    expect(result[0].marks).toEqual([]);
    expect(result[1].type).toBe('paragraph');
  });

  it('derives inline types from schema when provided', () => {
    // Build a minimal fake schema map using Map with forEach(name, nodeType)
    const nodes = new Map();
    nodes.set('paragraph', { spec: { group: 'block' } });
    nodes.set('table', { spec: { group: 'block' } });
    nodes.set('text', { spec: { group: 'inline' } });
    nodes.set('bookmarkStart', { spec: { group: 'inline' } });
    nodes.set('lineBreak', { spec: { group: 'inline' } });

    const editor = { schema: { nodes } };

    const input = [n('text'), n('bookmarkStart', { id: '3' }), n('paragraph'), n('lineBreak'), n('table')];
    const result = filterOutRootInlineNodes(input, editor);
    const types = result.map((x) => x.type);
    expect(types).toEqual(['passthroughBlock', 'paragraph', 'table']);
    expect(result[0].attrs.originalXml.attributes['w:id']).toBe('3');
  });
});

describe('collapseWhitespaceNextToInlinePassthrough', () => {
  const paragraph = (content) => ({ type: 'paragraph', content });

  it('trims duplicate spaces around passthrough nodes', () => {
    const tree = [
      paragraph([
        { type: 'text', text: 'Hello ' },
        { type: 'passthroughInline', attrs: {} },
        { type: 'text', text: ' world' },
      ]),
    ];

    collapseWhitespaceNextToInlinePassthrough(tree);

    expect(tree[0].content[0].text).toBe('Hello ');
    expect(tree[0].content[2].text).toBe('world');
  });

  it('removes empty trailing sibling created after trimming', () => {
    const tree = [
      paragraph([
        { type: 'text', text: 'Hello ' },
        { type: 'passthroughInline', attrs: {} },
        { type: 'text', text: ' ' },
      ]),
    ];

    collapseWhitespaceNextToInlinePassthrough(tree);

    expect(tree[0].content).toHaveLength(2);
    expect(tree[0].content[0].text).toBe('Hello ');
  });

  it('ignores cases where surrounding text lacks spaces', () => {
    const tree = [
      paragraph([
        { type: 'text', text: 'Hello' },
        { type: 'passthroughInline', attrs: {} },
        { type: 'text', text: ' world' },
      ]),
    ];

    collapseWhitespaceNextToInlinePassthrough(tree);

    expect(tree[0].content[0].text).toBe('Hello');
    expect(tree[0].content.at(-1).text).toBe(' world');
  });

  it('skips metadata nodes when searching for adjacent text', () => {
    const tree = [
      paragraph([
        { type: 'text', text: 'Hello ' },
        { type: 'bookmarkStart' },
        { type: 'passthroughInline', attrs: {} },
        { type: 'text', text: ' world' },
      ]),
    ];

    collapseWhitespaceNextToInlinePassthrough(tree);

    expect(tree[0].content[0].text).toBe('Hello ');
    expect(tree[0].content.at(-1).text).toBe('world');
  });

  it('handles text wrapped inside running nodes', () => {
    const tree = [
      paragraph([
        { type: 'run', content: [{ type: 'text', text: 'Foo ' }] },
        { type: 'passthroughInline', attrs: {} },
        { type: 'run', content: [{ type: 'text', text: ' bar' }] },
      ]),
    ];

    collapseWhitespaceNextToInlinePassthrough(tree);

    expect(tree[0].content[0].content[0].text).toBe('Foo ');
    expect(tree[0].content[2].content).toHaveLength(1);
    expect(tree[0].content[2].content[0].text).toBe('bar');
  });
});

describe('normalizeTableBookmarksInContent', () => {
  const table = (content) => ({ type: 'table', content, attrs: {}, marks: [] });
  const row = (cells) => ({ type: 'tableRow', content: cells, attrs: {}, marks: [] });
  const cell = (content) => ({ type: 'tableCell', content, attrs: {}, marks: [] });
  const paragraph = (content) => ({ type: 'paragraph', content, attrs: {}, marks: [] });
  const text = (value) => ({ type: 'text', text: value, marks: [] });
  const bookmarkStart = (id, attrs = {}) => ({ type: 'bookmarkStart', attrs: { id, ...attrs } });
  const bookmarkEnd = (id, attrs = {}) => ({ type: 'bookmarkEnd', attrs: { id, ...attrs } });

  it('moves leading bookmarkStart into the first cell paragraph', () => {
    const input = [table([bookmarkStart('b1'), row([cell([paragraph([text('Cell')])])])])];

    const result = normalizeTableBookmarksInContent(input);
    const normalizedTable = result[0];

    expect(normalizedTable.content.some((node) => node.type === 'bookmarkStart')).toBe(false);
    const paraContent = normalizedTable.content[0].content[0].content[0].content;
    expect(paraContent[0]).toMatchObject({ type: 'bookmarkStart', attrs: { id: 'b1' } });
    expect(paraContent[1]).toMatchObject({ type: 'text', text: 'Cell' });
  });

  it('moves trailing bookmarkEnd into the last cell paragraph', () => {
    const input = [table([row([cell([paragraph([text('Cell')])])]), bookmarkEnd('b1')])];

    const result = normalizeTableBookmarksInContent(input);
    const normalizedTable = result[0];

    expect(normalizedTable.content.some((node) => node.type === 'bookmarkEnd')).toBe(false);
    const paraContent = normalizedTable.content[0].content[0].content[0].content;
    expect(paraContent[0]).toMatchObject({ type: 'text', text: 'Cell' });
    expect(paraContent[1]).toMatchObject({ type: 'bookmarkEnd', attrs: { id: 'b1' } });
  });

  it('moves bookmarkStart and bookmarkEnd into the same cell when no textblocks exist', () => {
    const input = [table([bookmarkStart('b1'), row([cell([])]), bookmarkEnd('b1')])];

    const result = normalizeTableBookmarksInContent(input);
    const normalizedTable = result[0];

    expect(normalizedTable.content.some((node) => node.type === 'bookmarkStart')).toBe(false);
    expect(normalizedTable.content.some((node) => node.type === 'bookmarkEnd')).toBe(false);

    const paraContent = normalizedTable.content[0].content[0].content[0].content;
    expect(paraContent).toEqual([
      { type: 'bookmarkStart', attrs: { id: 'b1' } },
      { type: 'bookmarkEnd', attrs: { id: 'b1' } },
    ]);
  });

  it('anchors bookmark boundaries to adjacent rows when markers appear between rows', () => {
    const input = [
      table([
        bookmarkStart('b1'),
        row([cell([paragraph([text('R1')])])]),
        bookmarkEnd('b1'),
        row([cell([paragraph([text('R2')])])]),
      ]),
    ];

    const result = normalizeTableBookmarksInContent(input);
    const normalizedTable = result[0];

    const row1Content = normalizedTable.content[0].content[0].content[0].content;
    expect(row1Content).toEqual([
      { type: 'bookmarkStart', attrs: { id: 'b1' } },
      { type: 'text', text: 'R1', marks: [] },
      { type: 'bookmarkEnd', attrs: { id: 'b1' } },
    ]);

    const row2Content = normalizedTable.content[1].content[0].content[0].content;
    expect(row2Content).toEqual([{ type: 'text', text: 'R2', marks: [] }]);
  });

  it('creates a cell when a row is empty', () => {
    const input = [table([bookmarkStart('b1'), row([]), bookmarkEnd('b1')])];

    const result = normalizeTableBookmarksInContent(input);
    const normalizedTable = result[0];

    const rowContent = normalizedTable.content[0].content;
    expect(rowContent).toHaveLength(1);
    expect(rowContent[0].type).toBe('tableCell');

    const paraContent = rowContent[0].content[0].content;
    expect(paraContent).toEqual([
      { type: 'bookmarkStart', attrs: { id: 'b1' } },
      { type: 'bookmarkEnd', attrs: { id: 'b1' } },
    ]);
  });

  it('places bookmarkStart in the cell indicated by colFirst when present; bookmarkEnd uses first/last cell only', () => {
    const twoCells = row([cell([paragraph([text('A')])]), cell([paragraph([text('B')])])]);
    const input = [table([bookmarkStart('b1', { colFirst: '1' }), twoCells, bookmarkEnd('b1')])];

    const result = normalizeTableBookmarksInContent(input);
    const normalizedTable = result[0];
    const rowContent = normalizedTable.content[0].content;

    expect(normalizedTable.content.some((node) => node.type === 'bookmarkStart')).toBe(false);
    expect(normalizedTable.content.some((node) => node.type === 'bookmarkEnd')).toBe(false);

    const firstCellContent = rowContent[0].content[0].content;
    expect(firstCellContent).toEqual([{ type: 'text', text: 'A', marks: [] }]);

    const secondCellContent = rowContent[1].content[0].content;
    expect(secondCellContent[0]).toMatchObject({ type: 'bookmarkStart', attrs: { id: 'b1', colFirst: '1' } });
    expect(secondCellContent[1]).toMatchObject({ type: 'text', text: 'B', marks: [] });
    expect(secondCellContent[2]).toMatchObject({ type: 'bookmarkEnd', attrs: { id: 'b1' } });
  });

  it('normalizes bookmarks in a nested table (table inside a cell with bookmarks as direct children of inner table)', () => {
    const innerTableWithBookmarks = table([
      bookmarkStart('n1'),
      row([cell([paragraph([text('Nested')])])]),
      bookmarkEnd('n1'),
    ]);
    const outerTable = table([row([cell([innerTableWithBookmarks])])]);
    const input = [outerTable];

    const result = normalizeTableBookmarksInContent(input);
    const outer = result[0];
    const inner = outer.content[0].content[0].content[0];

    expect(inner.type).toBe('table');
    expect(inner.content.some((node) => node.type === 'bookmarkStart')).toBe(false);
    expect(inner.content.some((node) => node.type === 'bookmarkEnd')).toBe(false);

    const innerCellParagraphContent = inner.content[0].content[0].content[0].content;
    expect(innerCellParagraphContent[0]).toMatchObject({ type: 'bookmarkStart', attrs: { id: 'n1' } });
    expect(innerCellParagraphContent[1]).toMatchObject({ type: 'text', text: 'Nested', marks: [] });
    expect(innerCellParagraphContent[2]).toMatchObject({ type: 'bookmarkEnd', attrs: { id: 'n1' } });
  });
});
