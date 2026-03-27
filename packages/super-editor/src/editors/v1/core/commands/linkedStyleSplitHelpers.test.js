import { describe, expect, it } from 'vitest';
import { clearInheritedLinkedStyleId, isLinkedParagraphStyleId } from './linkedStyleSplitHelpers.js';

describe('linkedStyleSplitHelpers', () => {
  describe('isLinkedParagraphStyleId', () => {
    it('returns true for linked paragraph styles from the converter', () => {
      const editor = {
        converter: {
          translatedLinkedStyles: {
            styles: {
              Heading1: { styleId: 'Heading1', type: 'paragraph', link: 'Heading1Char' },
              Emphasis: { styleId: 'Emphasis', type: 'character', link: 'EmphasisPara' },
            },
          },
        },
      };

      expect(isLinkedParagraphStyleId(editor, 'Heading1')).toBe(true);
    });

    it('returns false for missing style ids, missing converter data, non-paragraph styles, and ordinary paragraph styles', () => {
      expect(isLinkedParagraphStyleId({}, 'Heading1')).toBe(false);
      expect(
        isLinkedParagraphStyleId(
          {
            converter: {
              translatedLinkedStyles: {
                styles: {
                  Emphasis: { styleId: 'Emphasis', type: 'character', link: 'EmphasisPara' },
                },
              },
            },
          },
          'Emphasis',
        ),
      ).toBe(false);
      expect(
        isLinkedParagraphStyleId(
          {
            converter: {
              translatedLinkedStyles: {
                styles: {
                  BodyText: { styleId: 'BodyText', type: 'paragraph' },
                },
              },
            },
          },
          'BodyText',
        ),
      ).toBe(false);
      expect(
        isLinkedParagraphStyleId(
          {
            converter: {
              translatedLinkedStyles: {
                styles: {
                  Heading1: { styleId: 'Heading1', type: 'paragraph', link: 'Heading1Char' },
                },
              },
            },
          },
          null,
        ),
      ).toBe(false);
    });
  });

  describe('clearInheritedLinkedStyleId', () => {
    it('removes styleId when it belongs to a linked paragraph style', () => {
      const editor = {
        converter: {
          translatedLinkedStyles: {
            styles: {
              Heading1: { styleId: 'Heading1', type: 'paragraph', link: 'Heading1Char' },
            },
          },
        },
      };
      const attrs = {
        paragraphProperties: { styleId: 'Heading1', keep: true },
        preserve: true,
      };

      const result = clearInheritedLinkedStyleId(attrs, editor, { emptyParagraph: true });

      expect(result).toEqual({
        paragraphProperties: { styleId: null, keep: true },
        preserve: true,
      });
      expect(attrs).toEqual({
        paragraphProperties: { styleId: 'Heading1', keep: true },
        preserve: true,
      });
    });

    it('preserves linked paragraph styleId when the new paragraph is not empty', () => {
      const editor = {
        converter: {
          translatedLinkedStyles: {
            styles: {
              Heading1: { styleId: 'Heading1', type: 'paragraph', link: 'Heading1Char' },
            },
          },
        },
      };
      const attrs = {
        paragraphProperties: { styleId: 'Heading1', keep: true },
      };

      expect(clearInheritedLinkedStyleId(attrs, editor, { emptyParagraph: false })).toBe(attrs);
    });

    it('leaves attrs unchanged for non-linked styles or missing paragraphProperties', () => {
      const editor = {
        converter: {
          translatedLinkedStyles: {
            styles: {
              Heading1: { styleId: 'Heading1', type: 'paragraph', link: 'Heading1Char' },
              BodyText: { styleId: 'BodyText', type: 'paragraph' },
            },
          },
        },
      };
      const attrs = {
        paragraphProperties: { styleId: 'BodyText', keep: true },
      };

      expect(clearInheritedLinkedStyleId(attrs, editor, { emptyParagraph: false })).toBe(attrs);
      expect(clearInheritedLinkedStyleId(attrs, editor, { emptyParagraph: true })).toBe(attrs);
      expect(clearInheritedLinkedStyleId({ preserve: true }, editor, { emptyParagraph: true })).toEqual({
        preserve: true,
      });
      expect(clearInheritedLinkedStyleId(null, editor, { emptyParagraph: true })).toBe(null);
    });
  });
});
