import { describe, expect, it } from 'vitest';
import type { FlowBlock } from '@superdoc/contracts';

import { isWordCharacter, calculateExtendedSelection } from '../SelectionHelpers.js';

describe('SelectionHelpers', () => {
  describe('isWordCharacter', () => {
    it('returns false for empty string', () => {
      expect(isWordCharacter('')).toBe(false);
    });

    it('returns true for ASCII letters', () => {
      expect(isWordCharacter('a')).toBe(true);
      expect(isWordCharacter('Z')).toBe(true);
    });

    it('returns true for ASCII digits', () => {
      expect(isWordCharacter('0')).toBe(true);
      expect(isWordCharacter('9')).toBe(true);
    });

    it('returns true for apostrophe', () => {
      expect(isWordCharacter("'")).toBe(true);
    });

    it('returns true for right single quotation mark (curly apostrophe)', () => {
      expect(isWordCharacter('\u2019')).toBe(true);
    });

    it('returns true for underscore', () => {
      expect(isWordCharacter('_')).toBe(true);
    });

    it('returns true for tilde', () => {
      expect(isWordCharacter('~')).toBe(true);
    });

    it('returns true for hyphen', () => {
      expect(isWordCharacter('-')).toBe(true);
    });

    it('returns false for space', () => {
      expect(isWordCharacter(' ')).toBe(false);
    });

    it('returns false for punctuation', () => {
      expect(isWordCharacter('.')).toBe(false);
      expect(isWordCharacter(',')).toBe(false);
      expect(isWordCharacter('!')).toBe(false);
      expect(isWordCharacter('?')).toBe(false);
    });

    it('returns true for Unicode letters (Latin)', () => {
      expect(isWordCharacter('é')).toBe(true);
      expect(isWordCharacter('ñ')).toBe(true);
      expect(isWordCharacter('ü')).toBe(true);
    });

    it('returns true for Unicode letters (Cyrillic)', () => {
      expect(isWordCharacter('а')).toBe(true);
      expect(isWordCharacter('я')).toBe(true);
    });

    it('returns true for Unicode letters (CJK)', () => {
      expect(isWordCharacter('中')).toBe(true);
      expect(isWordCharacter('日')).toBe(true);
    });

    it('returns true for Unicode digits', () => {
      expect(isWordCharacter('٠')).toBe(true); // Arabic-Indic digit zero
      expect(isWordCharacter('①')).toBe(true); // Circled digit one
    });

    it('returns false for emoji', () => {
      expect(isWordCharacter('😀')).toBe(false);
      expect(isWordCharacter('🎉')).toBe(false);
    });
  });

  describe('calculateExtendedSelection', () => {
    const createMockParagraphBlock = (id: string, text: string, pmStart: number): FlowBlock => ({
      kind: 'paragraph',
      id,
      runs: [
        {
          text,
          fontFamily: 'Arial',
          fontSize: 14,
          pmStart,
          pmEnd: pmStart + text.length,
        },
      ],
    });

    describe('char mode', () => {
      it('returns positions unchanged in char mode', () => {
        const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world', 1)];

        const result = calculateExtendedSelection(blocks, 5, 8, 'char');

        expect(result.selAnchor).toBe(5);
        expect(result.selHead).toBe(8);
      });

      it('handles backward selection in char mode', () => {
        const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world', 1)];

        const result = calculateExtendedSelection(blocks, 8, 5, 'char');

        expect(result.selAnchor).toBe(8);
        expect(result.selHead).toBe(5);
      });
    });

    describe('word mode', () => {
      it('extends to word boundaries when dragging forward', () => {
        const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world test', 1)];

        // Anchor in "Hello" (pos 3), head in "world" (pos 9)
        const result = calculateExtendedSelection(blocks, 3, 9, 'word');

        // Should extend from start of "Hello" to end of "world"
        expect(result.selAnchor).toBeLessThanOrEqual(3);
        expect(result.selHead).toBeGreaterThanOrEqual(9);
      });

      it('extends to word boundaries when dragging backward', () => {
        const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world test', 1)];

        // Anchor in "world" (pos 9), head in "Hello" (pos 3)
        const result = calculateExtendedSelection(blocks, 9, 3, 'word');

        // Should extend from end of "world" to start of "Hello"
        expect(result.selAnchor).toBeGreaterThanOrEqual(9);
        expect(result.selHead).toBeLessThanOrEqual(3);
      });

      it('falls back to char mode when word boundaries not found', () => {
        const blocks: FlowBlock[] = [];

        const result = calculateExtendedSelection(blocks, 5, 8, 'word');

        expect(result.selAnchor).toBe(5);
        expect(result.selHead).toBe(8);
      });
    });

    describe('para mode', () => {
      it('extends to paragraph boundaries when dragging forward', () => {
        const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world', 1)];

        // Select within paragraph
        const result = calculateExtendedSelection(blocks, 3, 8, 'para');

        // Should extend to paragraph boundaries
        expect(result.selAnchor).toBeLessThanOrEqual(3);
        expect(result.selHead).toBeGreaterThanOrEqual(8);
      });

      it('extends to paragraph boundaries when dragging backward', () => {
        const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world', 1)];

        const result = calculateExtendedSelection(blocks, 8, 3, 'para');

        // Should extend to paragraph boundaries (reversed)
        expect(result.selAnchor).toBeGreaterThanOrEqual(8);
        expect(result.selHead).toBeLessThanOrEqual(3);
      });

      it('falls back to char mode when paragraph boundaries not found', () => {
        const blocks: FlowBlock[] = [];

        const result = calculateExtendedSelection(blocks, 5, 8, 'para');

        expect(result.selAnchor).toBe(5);
        expect(result.selHead).toBe(8);
      });
    });

    it('handles empty blocks array', () => {
      const result = calculateExtendedSelection([], 5, 8, 'word');

      expect(result.selAnchor).toBe(5);
      expect(result.selHead).toBe(8);
    });

    it('handles same anchor and head position', () => {
      const blocks: FlowBlock[] = [createMockParagraphBlock('1-para', 'Hello world', 1)];

      const result = calculateExtendedSelection(blocks, 5, 5, 'word');

      // Should still try to find word boundaries
      expect(typeof result.selAnchor).toBe('number');
      expect(typeof result.selHead).toBe('number');
    });
  });
});
