import { describe, it, expect } from 'vitest';
import type { ParagraphBlock } from '@superdoc/contracts';
import {
  isListItem,
  getWordLayoutConfig,
  calculateTextStartIndent,
  extractParagraphIndent,
} from '../src/list-indent-utils.js';

/**
 * Unit tests for list-indent-utils.ts
 *
 * These tests verify the correct behavior of utility functions for list item detection
 * and text indent calculation, ensuring consistent handling of both standard hanging
 * indent lists and firstLineIndentMode lists.
 */

describe('list-indent-utils', () => {
  describe('getWordLayoutConfig', () => {
    it('should return undefined for undefined block', () => {
      expect(getWordLayoutConfig(undefined)).toBeUndefined();
    });

    it('should return undefined for non-paragraph block', () => {
      const block = { kind: 'table' } as unknown as ParagraphBlock;
      expect(getWordLayoutConfig(block)).toBeUndefined();
    });

    it('should return undefined when wordLayout is not present', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {},
      };
      expect(getWordLayoutConfig(block)).toBeUndefined();
    });

    it('should return wordLayout when present', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 56,
          },
        },
      };
      const config = getWordLayoutConfig(block);
      expect(config).toBeDefined();
      expect(config?.firstLineIndentMode).toBe(true);
      expect(config?.textStartPx).toBe(56);
    });
  });

  describe('isListItem', () => {
    it('should return true when markerWidth > 0', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
      };
      expect(isListItem(20, block)).toBe(true);
    });

    it('should return false when markerWidth is 0 and no list attributes', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {},
      };
      expect(isListItem(0, block)).toBe(false);
    });

    it('should return false for undefined block', () => {
      expect(isListItem(0, undefined)).toBe(false);
    });

    it('should return false for non-paragraph block', () => {
      const block = { kind: 'table' } as unknown as ParagraphBlock;
      expect(isListItem(0, block)).toBe(false);
    });

    it('should return true when listItem attribute is present', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          listItem: {},
        },
      };
      expect(isListItem(0, block)).toBe(true);
    });

    it('should return true when wordLayout.marker is present', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          wordLayout: {
            marker: { text: '1.' },
          },
        },
      };
      expect(isListItem(0, block)).toBe(true);
    });

    it('should return true when hanging indent pattern is detected', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          indent: {
            left: 36,
            hanging: 18,
          },
        },
      };
      expect(isListItem(0, block)).toBe(true);
    });

    it('should return false when only left indent without hanging', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          indent: {
            left: 36,
          },
        },
      };
      expect(isListItem(0, block)).toBe(false);
    });

    it('should return false when only hanging indent without left', () => {
      const block: ParagraphBlock = {
        kind: 'paragraph',
        id: '1-paragraph',
        runs: [],
        attrs: {
          indent: {
            hanging: 18,
          },
        },
      };
      expect(isListItem(0, block)).toBe(false);
    });
  });

  describe('extractParagraphIndent', () => {
    it('should return zeros for undefined indent', () => {
      const result = extractParagraphIndent(undefined);
      expect(result).toEqual({
        left: 0,
        right: 0,
        firstLine: 0,
        hanging: 0,
      });
    });

    it('should extract all indent values', () => {
      const result = extractParagraphIndent({
        left: 36,
        right: 18,
        firstLine: 24,
        hanging: 18,
      });
      expect(result).toEqual({
        left: 36,
        right: 18,
        firstLine: 24,
        hanging: 18,
      });
    });

    it('should default missing values to zero', () => {
      const result = extractParagraphIndent({
        left: 36,
      });
      expect(result).toEqual({
        left: 36,
        right: 0,
        firstLine: 0,
        hanging: 0,
      });
    });

    it('should handle non-finite values by defaulting to zero', () => {
      const result = extractParagraphIndent({
        left: NaN,
        right: Infinity,
        firstLine: -Infinity,
        hanging: 18,
      });
      expect(result).toEqual({
        left: 0,
        right: 0,
        firstLine: 0,
        hanging: 18,
      });
    });

    it('should handle negative indent values', () => {
      const result = extractParagraphIndent({
        left: -10,
        right: 0,
        firstLine: -5,
        hanging: 0,
      });
      expect(result).toEqual({
        left: -10,
        right: 0,
        firstLine: -5,
        hanging: 0,
      });
    });
  });

  describe('calculateTextStartIndent', () => {
    describe('non-list paragraphs', () => {
      it('should return paraIndentLeft for non-list, non-first line', () => {
        const result = calculateTextStartIndent({
          isFirstLine: false,
          isListItem: false,
          markerWidth: 0,
          paraIndentLeft: 36,
          firstLineIndent: 24,
          hangingIndent: 0,
        });
        expect(result).toBe(36);
      });

      it('should add first-line offset for non-list first line', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: false,
          markerWidth: 0,
          paraIndentLeft: 36,
          firstLineIndent: 24,
          hangingIndent: 0,
        });
        // paraIndentLeft + (firstLineIndent - hangingIndent)
        // 36 + (24 - 0) = 60
        expect(result).toBe(60);
      });

      it('should handle negative first-line indent (outdent)', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: false,
          markerWidth: 0,
          paraIndentLeft: 36,
          firstLineIndent: -18,
          hangingIndent: 0,
        });
        // paraIndentLeft + (firstLineIndent - hangingIndent)
        // 36 + (-18 - 0) = 18
        expect(result).toBe(18);
      });
    });

    describe('standard hanging indent lists', () => {
      it('should use paraIndentLeft when canonical text-start data is unavailable', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
        });
        expect(result).toBe(36);
      });

      it('should return paraIndentLeft for standard list non-first line', () => {
        const result = calculateTextStartIndent({
          isFirstLine: false,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
        });
        expect(result).toBe(36);
      });
    });

    describe('firstLineIndentMode lists', () => {
      it('should use textStartPx when available', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 56,
          },
        });
        expect(result).toBe(56);
      });

      it('should use marker.textStartX when textStartPx is missing', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
            marker: {
              textStartX: 60,
            },
          },
        });
        expect(result).toBe(60);
      });

      it('should use paraIndentLeft when firstLineIndentMode has no explicit text start', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
          },
        });
        expect(result).toBe(36);
      });

      it('should use paraIndentLeft when textStartPx is non-finite', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: NaN,
          },
        });
        expect(result).toBe(36);
      });

      it('should not re-derive from firstLineIndent when text start is missing', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 10,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
          },
        });
        expect(result).toBe(36);
      });

      it('should keep paraIndentLeft for negative firstLineIndent when text start is missing', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: -10,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
          },
        });
        expect(result).toBe(36);
      });

      it('should not apply firstLineIndentMode on non-first lines', () => {
        const result = calculateTextStartIndent({
          isFirstLine: false,
          isListItem: true,
          markerWidth: 20,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 56,
          },
        });
        // Non-first line: should use paraIndentLeft only
        expect(result).toBe(36);
      });

      it('should not apply firstLineIndentMode when firstLineIndentMode is false', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          markerTextWidth: 10,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: false,
            textStartPx: 56,
          },
        });
        // firstLineIndentMode: false, but textStartPx provided: should still respect textStartPx
        expect(result).toBe(56);
      });
    });

    describe('edge cases', () => {
      it('should handle zero indents', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: false,
          markerWidth: 0,
          paraIndentLeft: 0,
          firstLineIndent: 0,
          hangingIndent: 0,
        });
        expect(result).toBe(0);
      });

      it('should handle large indent values', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: false,
          markerWidth: 0,
          paraIndentLeft: 1000,
          firstLineIndent: 500,
          hangingIndent: 0,
        });
        // 1000 + (500 - 0) = 1500
        expect(result).toBe(1500);
      });

      it('should handle firstLineIndentMode with zero marker width', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 0,
          markerTextWidth: 0,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            firstLineIndentMode: true,
            textStartPx: 56,
          },
        });
        // Should use textStartPx regardless of marker width
        expect(result).toBe(56);
      });

      it('should not synthesize list marker geometry when wordLayout is missing', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 20,
          markerTextWidth: 12,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
        });
        expect(result).toBe(36);
      });

      it('should use textStartPx for standard lists when provided', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 24,
          markerTextWidth: 12,
          paraIndentLeft: 36,
          firstLineIndent: 0,
          hangingIndent: 18,
          wordLayout: {
            textStartPx: 50,
            marker: {
              textStartX: 50,
            },
          },
        });
        expect(result).toBe(50);
      });

      it('should keep paraIndentLeft when marker widths exist but canonical data is missing', () => {
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 24,
          markerTextWidth: undefined, // Simulates missing markerTextWidth from fragment
          paraIndentLeft: 48,
          firstLineIndent: 0,
          hangingIndent: 24,
        });
        expect(result).toBe(48);
      });

      it('should return paraIndentLeft for non-hanging lists', () => {
        // When hangingIndent is 0, the fallback should not kick in
        const result = calculateTextStartIndent({
          isFirstLine: true,
          isListItem: true,
          markerWidth: 24,
          markerTextWidth: undefined,
          paraIndentLeft: 48,
          firstLineIndent: 0,
          hangingIndent: 0, // No hanging indent
        });
        // Without hanging indent, should return paraIndentLeft
        expect(result).toBe(48);
      });
    });
  });
});
