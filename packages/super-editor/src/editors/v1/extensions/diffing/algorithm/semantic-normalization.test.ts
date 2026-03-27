import { describe, it, expect } from 'vitest';
import {
  normalizeParagraphAttrs,
  normalizeImageNodeJSON,
  normalizeInlineNodeJSON,
  normalizeInlineNodeAttrs,
  normalizeParagraphNodeJSON,
  normalizeDocJSON,
  semanticInlineNodeKey,
} from './semantic-normalization';

describe('normalizeParagraphAttrs', () => {
  it('strips all volatile paragraph attributes', () => {
    const attrs = {
      paraId: '1A2B3C4D',
      textId: '77777777',
      rsidR: '00A1B2C3',
      rsidRDefault: '00D4E5F6',
      rsidP: '00112233',
      rsidRPr: '00445566',
      rsidDel: '00778899',
      align: 'center',
      indent: { left: 720 },
    };

    const result = normalizeParagraphAttrs(attrs);

    expect(result).toEqual({
      align: 'center',
      indent: { left: 720 },
    });
  });

  it('returns all attributes when none are volatile', () => {
    const attrs = { align: 'left', spacing: { before: 100 } };
    const result = normalizeParagraphAttrs(attrs);
    expect(result).toEqual(attrs);
  });

  it('returns an empty object for empty input', () => {
    expect(normalizeParagraphAttrs({})).toEqual({});
  });
});

describe('normalizeImageNodeJSON', () => {
  it('strips volatile keys from originalAttributes', () => {
    const nodeJSON = {
      type: 'image',
      attrs: {
        src: 'image1.png',
        size: { width: 100, height: 100 },
        originalAttributes: {
          'wp14:anchorId': '4A5B6C7D',
          'wp14:editId': '8E9F0A1B',
          cx: '914400',
          cy: '914400',
        },
      },
    };

    const result = normalizeImageNodeJSON(nodeJSON);

    expect(result.attrs.originalAttributes).toEqual({
      cx: '914400',
      cy: '914400',
    });
    expect(result.attrs.src).toBe('image1.png');
    expect(result.attrs.size).toEqual({ width: 100, height: 100 });
  });

  it('returns the node unchanged when originalAttributes is absent', () => {
    const nodeJSON = { type: 'image', attrs: { src: 'img.png' } };
    const result = normalizeImageNodeJSON(nodeJSON);
    expect(result).toEqual(nodeJSON);
  });

  it('preserves non-volatile originalAttributes keys', () => {
    const nodeJSON = {
      type: 'image',
      attrs: {
        originalAttributes: { cx: '100', cy: '200' },
      },
    };

    const result = normalizeImageNodeJSON(nodeJSON);
    expect(result.attrs.originalAttributes).toEqual({ cx: '100', cy: '200' });
  });

  it('does not mutate the input', () => {
    const original = {
      type: 'image',
      attrs: {
        originalAttributes: { 'wp14:anchorId': 'AAA', cx: '100' },
      },
    };
    const copy = JSON.parse(JSON.stringify(original));

    normalizeImageNodeJSON(original);

    expect(original).toEqual(copy);
  });
});

describe('normalizeInlineNodeJSON', () => {
  it('normalizes image nodes', () => {
    const imageJSON = {
      type: 'image',
      attrs: {
        originalAttributes: { 'wp14:anchorId': 'X', keep: 'yes' },
      },
    };

    const result = normalizeInlineNodeJSON(imageJSON);
    expect(result.attrs.originalAttributes).toEqual({ keep: 'yes' });
  });

  it('passes non-image nodes through unchanged', () => {
    const linkJSON = { type: 'link', attrs: { href: 'http://example.com' } };
    const result = normalizeInlineNodeJSON(linkJSON);
    expect(result).toBe(linkJSON);
  });
});

describe('normalizeParagraphNodeJSON', () => {
  it('strips volatile attrs and normalizes nested image nodes', () => {
    const paragraphJSON = {
      type: 'paragraph',
      attrs: { paraId: 'AABB', rsidR: '0011', align: 'left' },
      content: [
        {
          type: 'run',
          attrs: {},
          content: [
            {
              type: 'image',
              attrs: {
                src: 'photo.png',
                originalAttributes: {
                  'wp14:anchorId': 'DEAD',
                  'wp14:editId': 'BEEF',
                  cx: '500',
                },
              },
            },
          ],
        },
      ],
    };

    const result = normalizeParagraphNodeJSON(paragraphJSON) as any;

    expect(result.attrs).toEqual({ align: 'left' });
    expect(result.content[0].content[0].attrs.originalAttributes).toEqual({ cx: '500' });
    expect(result.content[0].content[0].attrs.src).toBe('photo.png');
  });

  it('handles paragraphs with no content', () => {
    const paragraphJSON = {
      type: 'paragraph',
      attrs: { paraId: 'X', align: 'center' },
    };

    const result = normalizeParagraphNodeJSON(paragraphJSON);
    expect(result.attrs).toEqual({ align: 'center' });
    expect(result).not.toHaveProperty('content');
  });

  it('handles text-only paragraphs without modifying content', () => {
    const paragraphJSON = {
      type: 'paragraph',
      attrs: { rsidR: '00AA' },
      content: [
        {
          type: 'run',
          attrs: {},
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    };

    const result = normalizeParagraphNodeJSON(paragraphJSON) as any;
    expect(result.content[0].content[0]).toEqual({ type: 'text', text: 'hello' });
  });
});

describe('normalizeDocJSON', () => {
  it('normalizes paragraphs within a document tree', () => {
    const docJSON = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { paraId: 'P1', rsidR: 'R1', align: 'left' },
          content: [
            {
              type: 'run',
              attrs: {},
              content: [
                {
                  type: 'image',
                  attrs: {
                    src: 'test.png',
                    originalAttributes: { 'wp14:anchorId': 'A1' },
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          attrs: { paraId: 'P2', align: 'right' },
          content: [
            {
              type: 'run',
              attrs: {},
              content: [{ type: 'text', text: 'world' }],
            },
          ],
        },
      ],
    };

    const result = normalizeDocJSON(docJSON) as any;

    // First paragraph: volatile attrs stripped, image normalized
    expect(result.content[0].attrs).toEqual({ align: 'left' });
    expect(result.content[0].content[0].content[0].attrs.originalAttributes).toEqual({});

    // Second paragraph: volatile attrs stripped, text untouched
    expect(result.content[1].attrs).toEqual({ align: 'right' });
    expect(result.content[1].content[0].content[0]).toEqual({ type: 'text', text: 'world' });
  });

  it('recurses into structural containers (tables, etc.)', () => {
    const docJSON = {
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: {},
          content: [
            {
              type: 'tableRow',
              attrs: {},
              content: [
                {
                  type: 'tableCell',
                  attrs: {},
                  content: [
                    {
                      type: 'paragraph',
                      attrs: { paraId: 'TC1', rsidR: 'R9' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = normalizeDocJSON(docJSON) as any;
    const cellParagraph = result.content[0].content[0].content[0].content[0];
    expect(cellParagraph.attrs).toEqual({});
  });

  it('returns the doc unchanged when there is no content', () => {
    const docJSON = { type: 'doc' };
    expect(normalizeDocJSON(docJSON)).toEqual(docJSON);
  });
});

describe('normalizeInlineNodeAttrs', () => {
  it('strips volatile keys from image originalAttributes', () => {
    const attrs = {
      src: 'img.png',
      originalAttributes: {
        'wp14:anchorId': 'A1',
        'wp14:editId': 'E1',
        cx: '100',
      },
    };

    const result = normalizeInlineNodeAttrs('image', attrs);

    expect(result.originalAttributes).toEqual({ cx: '100' });
    expect(result.src).toBe('img.png');
  });

  it('passes non-image attrs through unchanged', () => {
    const attrs = { href: 'http://example.com' };
    const result = normalizeInlineNodeAttrs('link', attrs);
    expect(result).toBe(attrs);
  });

  it('passes image attrs through when originalAttributes is absent', () => {
    const attrs = { src: 'img.png' };
    const result = normalizeInlineNodeAttrs('image', attrs);
    expect(result).toBe(attrs);
  });
});

describe('semanticInlineNodeKey', () => {
  it('produces identical keys for images differing only in volatile attrs', () => {
    const makeNode = (anchorId: string) => ({
      type: { name: 'image' },
      toJSON: () => ({
        type: 'image',
        attrs: { src: 'same.png', originalAttributes: { 'wp14:anchorId': anchorId, cx: '100' } },
      }),
    });

    expect(semanticInlineNodeKey(makeNode('A'))).toBe(semanticInlineNodeKey(makeNode('B')));
  });

  it('produces different keys for images with different semantic attrs', () => {
    const makeNode = (src: string) => ({
      type: { name: 'image' },
      toJSON: () => ({
        type: 'image',
        attrs: { src, originalAttributes: { 'wp14:anchorId': 'same' } },
      }),
    });

    expect(semanticInlineNodeKey(makeNode('a.png'))).not.toBe(semanticInlineNodeKey(makeNode('b.png')));
  });

  it('passes non-image nodes through without normalization', () => {
    const node = {
      type: { name: 'link' },
      toJSON: () => ({ type: 'link', attrs: { href: 'http://example.com' } }),
    };

    expect(semanticInlineNodeKey(node)).toBe(JSON.stringify({ type: 'link', attrs: { href: 'http://example.com' } }));
  });
});
