import { describe, it, expect } from 'vitest';
import { collapseWhitespaceNextToInlinePassthrough, filterOutRootInlineNodes } from './docxImporter.js';

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
