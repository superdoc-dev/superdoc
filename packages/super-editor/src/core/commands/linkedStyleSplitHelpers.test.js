import { describe, expect, it } from 'vitest';
import { clearInheritedLinkedStyleId, isLinkedParagraphStyleId } from './linkedStyleSplitHelpers.js';

describe('linkedStyleSplitHelpers', () => {
  describe('isLinkedParagraphStyleId', () => {
    it('returns true for linked paragraph styles from the converter', () => {
      const editor = {
        converter: {
          linkedStyles: [
            { id: 'Heading1', type: 'paragraph' },
            { id: 'Emphasis', type: 'character' },
          ],
        },
      };

      expect(isLinkedParagraphStyleId(editor, 'Heading1')).toBe(true);
    });

    it('returns false for missing style ids, missing converter data, and non-paragraph styles', () => {
      expect(isLinkedParagraphStyleId({}, 'Heading1')).toBe(false);
      expect(
        isLinkedParagraphStyleId(
          {
            converter: {
              linkedStyles: [{ id: 'Emphasis', type: 'character' }],
            },
          },
          'Emphasis',
        ),
      ).toBe(false);
      expect(
        isLinkedParagraphStyleId(
          {
            converter: {
              linkedStyles: [{ id: 'Heading1', type: 'paragraph' }],
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
          linkedStyles: [{ id: 'Heading1', type: 'paragraph' }],
        },
      };
      const attrs = {
        paragraphProperties: { styleId: 'Heading1', keep: true },
        preserve: true,
      };

      const result = clearInheritedLinkedStyleId(attrs, editor);

      expect(result).toEqual({
        paragraphProperties: { keep: true },
        preserve: true,
      });
      expect(attrs).toEqual({
        paragraphProperties: { styleId: 'Heading1', keep: true },
        preserve: true,
      });
    });

    it('leaves attrs unchanged for non-linked styles or missing paragraphProperties', () => {
      const editor = {
        converter: {
          linkedStyles: [{ id: 'Heading1', type: 'paragraph' }],
        },
      };
      const attrs = {
        paragraphProperties: { styleId: 'BodyText', keep: true },
      };

      expect(clearInheritedLinkedStyleId(attrs, editor)).toBe(attrs);
      expect(clearInheritedLinkedStyleId({ preserve: true }, editor)).toEqual({ preserve: true });
      expect(clearInheritedLinkedStyleId(null, editor)).toBe(null);
    });
  });
});
