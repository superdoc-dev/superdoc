import { describe, expect, it } from 'vitest';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { serializeDocumentWithLists } from '../../editor';

const createParagraphNode = (text: string, attrs?: Record<string, unknown>): ProseMirrorNode => {
  return {
    type: { name: 'paragraph' },
    attrs: attrs ?? {},
    textContent: text,
  } as unknown as ProseMirrorNode;
};

const createDocNode = (children: ProseMirrorNode[]): ProseMirrorNode => {
  return {
    type: { name: 'doc' },
    forEach: (callback: (node: ProseMirrorNode, offset: number, index: number) => void) => {
      children.forEach((child, index) => callback(child, 0, index));
    },
  } as unknown as ProseMirrorNode;
};

describe('serializeDocumentWithLists', () => {
  it('serializes Word-style numbered paragraphs using marker text', () => {
    const numberedParagraph = createParagraphNode('Use of Images', {
      listRendering: { markerText: '1.', numberingType: 'decimal', path: [1] },
      paragraphProperties: { numberingProperties: { numId: 9, ilvl: 0 } },
    });
    const regularParagraph = createParagraphNode('Plain paragraph');

    const doc = createDocNode([numberedParagraph, regularParagraph]);
    expect(serializeDocumentWithLists(doc)).toBe('1. Use of Images\nPlain paragraph');
  });

  it('serializes Word-style bullet paragraphs with indentation', () => {
    const parentBullet = createParagraphNode('Parent bullet', {
      listRendering: { markerText: '•', numberingType: 'bullet', path: [1] },
      paragraphProperties: { numberingProperties: { numId: 1, ilvl: 0 } },
    });
    const childBullet = createParagraphNode('Nested bullet', {
      listRendering: { markerText: '•', numberingType: 'bullet', path: [1, 2] },
      paragraphProperties: { numberingProperties: { numId: 1, ilvl: 1 } },
    });

    const doc = createDocNode([parentBullet, childBullet]);
    expect(serializeDocumentWithLists(doc)).toBe('- Parent bullet\n  - Nested bullet');
  });

  it('falls back to numbering path when marker text is missing', () => {
    const fallbackParagraph = createParagraphNode('Fallback numbering', {
      listRendering: { numberingType: 'decimal', path: [3] },
      paragraphProperties: { numberingProperties: { numId: 2, ilvl: 0 } },
    });

    const doc = createDocNode([fallbackParagraph]);
    expect(serializeDocumentWithLists(doc)).toBe('3. Fallback numbering');
  });

  it('ensures there is spacing between inline section numbers and text', () => {
    const paragraph = createParagraphNode('3.4Taxes. Customer is responsible for taxes.');
    const doc = createDocNode([paragraph]);
    expect(serializeDocumentWithLists(doc)).toBe('3.4 Taxes. Customer is responsible for taxes.');
  });
});
