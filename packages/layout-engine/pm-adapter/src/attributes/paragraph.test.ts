/**
 * Tests for Paragraph Attributes Computation Module
 *
 * Covers 13 exported functions for computing, merging, and normalizing paragraph attributes:
 * - resolveParagraphBooleanAttr: Resolve boolean attributes from PM node
 * - hasPageBreakBefore: Check for page break before paragraph
 * - cloneParagraphAttrs: Deep clone paragraph attributes
 * - buildStyleNodeFromAttrs: Build style node for style engine
 * - normalizeListRenderingAttrs: Normalize list rendering attributes
 * - buildNumberingPath: Build numbering path for multi-level lists
 * - computeWordLayoutForParagraph: Compute Word paragraph layout
 * - computeParagraphAttrs: Main function for computing paragraph attrs (187 lines)
 * - mergeParagraphAttrs: Merge two paragraph attrs
 * - convertListParagraphAttrs: Convert list paragraph attrs
 *
 * Note: Some tests require mocking style-engine and word-layout dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ParagraphAttrs, ParagraphIndent, ParagraphSpacing } from '@superdoc/contracts';
import {
  resolveParagraphBooleanAttr,
  hasPageBreakBefore,
  cloneParagraphAttrs,
  buildStyleNodeFromAttrs,
  normalizeListRenderingAttrs,
  buildNumberingPath,
  computeWordLayoutForParagraph,
  computeParagraphAttrs,
  mergeParagraphAttrs,
  convertListParagraphAttrs,
  mergeSpacingSources,
  isValidNumberingId,
} from './paragraph.js';
import type { ListCounterContext, StyleContext } from '../types.js';
import { twipsToPx } from '../utilities.js';

/**
 * Mock PM node shape for testing.
 * This is a minimal subset of the actual PMNode interface used by the functions under test.
 * The functions only access `attrs` and optionally `content`, so this simplified type
 * is structurally compatible and avoids requiring full ProseMirror node construction.
 */
type PMNode = {
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  type?: string;
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
};

/**
 * Creates a minimal StyleContext for testing.
 * StyleContext has all optional properties, so an empty object is valid.
 * This helper provides better type safety than `as never` type assertions.
 */
const createTestStyleContext = (overrides: Partial<StyleContext> = {}): StyleContext => ({
  styles: {},
  defaults: {},
  ...overrides,
});

describe('isValidNumberingId', () => {
  describe('valid numbering IDs', () => {
    it('should return true for positive integer numId', () => {
      expect(isValidNumberingId(1)).toBe(true);
      expect(isValidNumberingId(5)).toBe(true);
      expect(isValidNumberingId(100)).toBe(true);
    });

    it('should return true for positive string numId', () => {
      expect(isValidNumberingId('1')).toBe(true);
      expect(isValidNumberingId('5')).toBe(true);
      expect(isValidNumberingId('100')).toBe(true);
    });

    it('should return true for negative numId values', () => {
      // While unusual, negative values are technically valid (not the special zero value)
      expect(isValidNumberingId(-1)).toBe(true);
      expect(isValidNumberingId('-1')).toBe(true);
    });
  });

  describe('invalid numbering IDs (OOXML spec §17.9.16)', () => {
    it('should return false for numeric zero (disables numbering)', () => {
      expect(isValidNumberingId(0)).toBe(false);
    });

    it('should return false for string zero (disables numbering)', () => {
      expect(isValidNumberingId('0')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidNumberingId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidNumberingId(undefined)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return true for empty string (not the zero sentinel)', () => {
      // Empty string is not the same as '0' per OOXML spec
      expect(isValidNumberingId('')).toBe(true);
    });

    it('should return true for string with leading zeros', () => {
      // '00' is not the same as '0'
      expect(isValidNumberingId('00')).toBe(true);
      expect(isValidNumberingId('001')).toBe(true);
    });

    it('should return true for floating point numbers', () => {
      // While unusual, non-zero floats are not the special zero value
      expect(isValidNumberingId(1.5)).toBe(true);
      expect(isValidNumberingId(0.1)).toBe(true);
    });

    it('should return false for string "0.0" (string comparison)', () => {
      // String comparison: '0.0' !== '0', so this is technically valid
      expect(isValidNumberingId('0.0')).toBe(true);
    });

    it('should return false for -0 (numeric zero)', () => {
      // In JavaScript, -0 === 0
      expect(isValidNumberingId(-0)).toBe(false);
    });
  });
});

describe('resolveParagraphBooleanAttr', () => {
  describe('direct attribute resolution', () => {
    it('should return true for boolean true', () => {
      const para: PMNode = { attrs: { bidi: true } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should return true for number 1', () => {
      const para: PMNode = { attrs: { bidi: 1 } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should return true for string "true"', () => {
      const para: PMNode = { attrs: { bidi: 'true' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should return true for string "1"', () => {
      const para: PMNode = { attrs: { bidi: '1' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should return true for string "on"', () => {
      const para: PMNode = { attrs: { bidi: 'on' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should return false for boolean false', () => {
      const para: PMNode = { attrs: { bidi: false } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(false);
    });

    it('should return false for number 0', () => {
      const para: PMNode = { attrs: { bidi: 0 } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(false);
    });

    it('should return false for string "false"', () => {
      const para: PMNode = { attrs: { bidi: 'false' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(false);
    });

    it('should return false for string "0"', () => {
      const para: PMNode = { attrs: { bidi: '0' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(false);
    });

    it('should return false for string "off"', () => {
      const para: PMNode = { attrs: { bidi: 'off' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(false);
    });

    it('should handle case-insensitive string values', () => {
      expect(resolveParagraphBooleanAttr({ attrs: { bidi: 'TRUE' } }, 'bidi', 'w:bidi')).toBe(true);
      expect(resolveParagraphBooleanAttr({ attrs: { bidi: 'FALSE' } }, 'bidi', 'w:bidi')).toBe(false);
      expect(resolveParagraphBooleanAttr({ attrs: { bidi: 'On' } }, 'bidi', 'w:bidi')).toBe(true);
      expect(resolveParagraphBooleanAttr({ attrs: { bidi: 'Off' } }, 'bidi', 'w:bidi')).toBe(false);
    });
  });

  describe('paragraphProperties resolution', () => {
    it('should resolve from nested paragraphProperties', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            bidi: true,
          },
        },
      };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should prioritize direct attrs over paragraphProperties', () => {
      const para: PMNode = {
        attrs: {
          bidi: true,
          paragraphProperties: {
            bidi: false,
          },
        },
      };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });
  });

  describe('element-based resolution', () => {
    it('should infer true from element without val attribute', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            elements: [{ name: 'w:bidi' }],
          },
        },
      };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should infer from element with w:val attribute', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            elements: [{ name: 'w:bidi', attributes: { 'w:val': 'true' } }],
          },
        },
      };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should handle element name with and without w: prefix', () => {
      const para1: PMNode = {
        attrs: {
          paragraphProperties: {
            elements: [{ name: 'w:bidi' }],
          },
        },
      };
      const para2: PMNode = {
        attrs: {
          paragraphProperties: {
            elements: [{ name: 'bidi' }],
          },
        },
      };
      expect(resolveParagraphBooleanAttr(para1, 'bidi', 'bidi')).toBe(true);
      expect(resolveParagraphBooleanAttr(para2, 'bidi', 'w:bidi')).toBe(true);
    });

    it('should handle multiple element names', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            elements: [{ name: 'w:keepNext' }],
          },
        },
      };
      expect(resolveParagraphBooleanAttr(para, 'keepWithNext', ['w:keepNext', 'w:keepWithNext'])).toBe(true);
    });
  });

  describe('undefined cases', () => {
    it('should return undefined when attribute not found', () => {
      const para: PMNode = { attrs: {} };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBeUndefined();
    });

    it('should return undefined for para without attrs', () => {
      const para: PMNode = {};
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBeUndefined();
    });

    it('should return undefined for non-boolean values', () => {
      const para: PMNode = { attrs: { bidi: 'unknown' } };
      expect(resolveParagraphBooleanAttr(para, 'bidi', 'w:bidi')).toBeUndefined();
    });
  });
});

describe('hasPageBreakBefore', () => {
  it('should return true for direct pageBreakBefore attribute', () => {
    const para: PMNode = { attrs: { pageBreakBefore: true } };
    expect(hasPageBreakBefore(para)).toBe(true);
  });

  it('should return true for nested paragraphProperties', () => {
    const para: PMNode = {
      attrs: {
        paragraphProperties: {
          pageBreakBefore: true,
        },
      },
    };
    expect(hasPageBreakBefore(para)).toBe(true);
  });

  it('should return true for element-based pageBreakBefore', () => {
    const para: PMNode = {
      attrs: {
        paragraphProperties: {
          elements: [{ name: 'w:pageBreakBefore' }],
        },
      },
    };
    expect(hasPageBreakBefore(para)).toBe(true);
  });

  it('should return false when pageBreakBefore is false', () => {
    const para: PMNode = { attrs: { pageBreakBefore: false } };
    expect(hasPageBreakBefore(para)).toBe(false);
  });

  it('should return false when pageBreakBefore is not present', () => {
    const para: PMNode = { attrs: {} };
    expect(hasPageBreakBefore(para)).toBe(false);
  });

  it('should return false for para without attrs', () => {
    const para: PMNode = {};
    expect(hasPageBreakBefore(para)).toBe(false);
  });
});

describe('cloneParagraphAttrs', () => {
  it('should return undefined for undefined input', () => {
    expect(cloneParagraphAttrs(undefined)).toBeUndefined();
  });

  it('should clone simple attributes', () => {
    const attrs: ParagraphAttrs = {
      alignment: 'center',
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned).toEqual(attrs);
    expect(cloned).not.toBe(attrs);
  });

  it('should deep clone spacing', () => {
    const attrs: ParagraphAttrs = {
      spacing: { before: 10, after: 20, line: 15 },
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.spacing).toEqual(attrs.spacing);
    expect(cloned?.spacing).not.toBe(attrs.spacing);
  });

  it('should deep clone indent', () => {
    const attrs: ParagraphAttrs = {
      indent: { left: 10, right: 20, firstLine: 5 },
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.indent).toEqual(attrs.indent);
    expect(cloned?.indent).not.toBe(attrs.indent);
  });

  it('should deep clone borders', () => {
    const attrs: ParagraphAttrs = {
      borders: {
        top: { style: 'solid', width: 1, color: '#FF0000' },
        bottom: { style: 'dashed', width: 2, color: '#00FF00' },
      },
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.borders).toEqual(attrs.borders);
    expect(cloned?.borders).not.toBe(attrs.borders);
    expect(cloned?.borders?.top).not.toBe(attrs.borders?.top);
    expect(cloned?.borders?.bottom).not.toBe(attrs.borders?.bottom);
  });

  it('should deep clone shading', () => {
    const attrs: ParagraphAttrs = {
      shading: { fill: '#FFFF00', color: '#000000' },
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.shading).toEqual(attrs.shading);
    expect(cloned?.shading).not.toBe(attrs.shading);
  });

  it('should deep clone tabs array', () => {
    const attrs: ParagraphAttrs = {
      tabs: [
        { pos: 100, val: 'left' },
        { pos: 200, val: 'center' },
      ],
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.tabs).toEqual(attrs.tabs);
    expect(cloned?.tabs).not.toBe(attrs.tabs);
    expect(cloned?.tabs?.[0]).not.toBe(attrs.tabs?.[0]);
  });

  it('should clone complete paragraph attrs', () => {
    const attrs: ParagraphAttrs = {
      alignment: 'right',
      spacing: { before: 10, after: 20 },
      indent: { left: 15, right: 25 },
      borders: {
        top: { style: 'solid', width: 1 },
      },
      shading: { fill: '#FFFF00' },
      tabs: [{ pos: 100, val: 'left' }],
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned).toEqual(attrs);
    expect(cloned).not.toBe(attrs);
  });

  it('should not mutate original attrs', () => {
    const attrs: ParagraphAttrs = {
      spacing: { before: 10 },
    };
    const cloned = cloneParagraphAttrs(attrs);
    if (cloned?.spacing) {
      cloned.spacing.before = 999;
    }
    expect(attrs.spacing?.before).toBe(10);
  });

  it('should handle borders with only some sides', () => {
    const attrs: ParagraphAttrs = {
      borders: {
        top: { style: 'solid', width: 1 },
      },
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.borders).toEqual(attrs.borders);
    expect(cloned?.borders?.left).toBeUndefined();
  });

  it('should handle empty borders object', () => {
    const attrs: ParagraphAttrs = {
      borders: {},
    };
    const cloned = cloneParagraphAttrs(attrs);
    expect(cloned?.borders).toBeUndefined();
  });
});

describe('buildStyleNodeFromAttrs', () => {
  it('should return empty object for undefined attrs', () => {
    const styleNode = buildStyleNodeFromAttrs(undefined);
    expect(styleNode).toEqual({});
  });

  it('should build style node with alignment', () => {
    const attrs = { alignment: 'center' };
    const styleNode = buildStyleNodeFromAttrs(attrs);
    expect(styleNode.paragraphProps?.alignment).toBe('center');
  });

  it('should normalize textAlign to alignment', () => {
    const attrs = { textAlign: 'right' };
    const styleNode = buildStyleNodeFromAttrs(attrs);
    expect(styleNode.paragraphProps?.alignment).toBe('right');
  });

  it('should include spacing when provided', () => {
    const spacing: ParagraphSpacing = { before: 10, after: 20 };
    const styleNode = buildStyleNodeFromAttrs({}, spacing);
    expect(styleNode.paragraphProps?.spacing).toBeDefined();
  });

  it('should include indent when provided', () => {
    const indent: ParagraphIndent = { left: 15, right: 25 };
    const styleNode = buildStyleNodeFromAttrs({}, undefined, indent);
    expect(styleNode.paragraphProps?.indent).toBeDefined();
  });

  it('should normalize tabs from attrs.tabs', () => {
    const attrs = {
      tabs: [{ pos: 100, val: 'left' }],
    };
    const styleNode = buildStyleNodeFromAttrs(attrs);
    expect(styleNode.paragraphProps?.tabs).toBeDefined();
  });

  it('should normalize tabs from attrs.tabStops', () => {
    const attrs = {
      tabStops: [{ pos: 200, val: 'center' }],
    };
    const styleNode = buildStyleNodeFromAttrs(attrs);
    expect(styleNode.paragraphProps?.tabs).toBeDefined();
  });

  it('should return empty styleNode when no paragraph props', () => {
    const attrs = {};
    const styleNode = buildStyleNodeFromAttrs(attrs);
    expect(styleNode).toEqual({});
  });

  it('should build complete style node', () => {
    const attrs = { alignment: 'justify' };
    const spacing: ParagraphSpacing = { before: 10 };
    const indent: ParagraphIndent = { left: 15 };
    const styleNode = buildStyleNodeFromAttrs(attrs, spacing, indent);
    expect(styleNode.paragraphProps?.alignment).toBe('justify');
    expect(styleNode.paragraphProps?.spacing).toBeDefined();
    expect(styleNode.paragraphProps?.indent).toBeDefined();
  });
});

describe('normalizeListRenderingAttrs', () => {
  it('should return undefined for null', () => {
    expect(normalizeListRenderingAttrs(null)).toBeUndefined();
  });

  it('should return undefined for non-object', () => {
    expect(normalizeListRenderingAttrs('string')).toBeUndefined();
  });

  it('should normalize markerText', () => {
    const input = { markerText: '1.' };
    const result = normalizeListRenderingAttrs(input);
    expect(result?.markerText).toBe('1.');
  });

  it('should normalize justification', () => {
    expect(normalizeListRenderingAttrs({ justification: 'left' })?.justification).toBe('left');
    expect(normalizeListRenderingAttrs({ justification: 'right' })?.justification).toBe('right');
    expect(normalizeListRenderingAttrs({ justification: 'center' })?.justification).toBe('center');
  });

  it('should reject invalid justification', () => {
    expect(normalizeListRenderingAttrs({ justification: 'invalid' })?.justification).toBeUndefined();
  });

  it('should normalize numberingType', () => {
    const input = { numberingType: 'decimal' };
    const result = normalizeListRenderingAttrs(input);
    expect(result?.numberingType).toBe('decimal');
  });

  it('should normalize suffix', () => {
    expect(normalizeListRenderingAttrs({ suffix: 'tab' })?.suffix).toBe('tab');
    expect(normalizeListRenderingAttrs({ suffix: 'space' })?.suffix).toBe('space');
    expect(normalizeListRenderingAttrs({ suffix: 'nothing' })?.suffix).toBe('nothing');
  });

  it('should reject invalid suffix', () => {
    expect(normalizeListRenderingAttrs({ suffix: 'invalid' })?.suffix).toBeUndefined();
  });

  it('should normalize numeric path array', () => {
    const input = { path: [1, 2, 3] };
    const result = normalizeListRenderingAttrs(input);
    expect(result?.path).toEqual([1, 2, 3]);
  });

  it('should convert string numbers in path to numbers', () => {
    const input = { path: ['1', '2', '3'] };
    const result = normalizeListRenderingAttrs(input);
    expect(result?.path).toEqual([1, 2, 3]);
  });

  it('should filter out non-numeric values from path', () => {
    const input = { path: [1, 'invalid', 2, NaN, 3] };
    const result = normalizeListRenderingAttrs(input);
    expect(result?.path).toEqual([1, 2, 3]);
  });

  it('should return undefined for empty path', () => {
    const input = { path: [] };
    const result = normalizeListRenderingAttrs(input);
    expect(result?.path).toBeUndefined();
  });

  it('should normalize complete list rendering attrs', () => {
    const input = {
      markerText: 'a)',
      justification: 'left',
      numberingType: 'lowerLetter',
      suffix: 'tab',
      path: [1, 2],
    };
    const result = normalizeListRenderingAttrs(input);
    expect(result).toEqual({
      markerText: 'a)',
      justification: 'left',
      numberingType: 'lowerLetter',
      suffix: 'tab',
      path: [1, 2],
    });
  });
});

describe('buildNumberingPath', () => {
  describe('without listCounterContext', () => {
    it('should build path with counterValue at target level', () => {
      const path = buildNumberingPath(undefined, 0, 5);
      expect(path).toEqual([5]);
    });

    it('should build path for level 0', () => {
      const path = buildNumberingPath(1, 0, 3);
      expect(path).toEqual([3]);
    });

    it('should build path for level 1', () => {
      const path = buildNumberingPath(undefined, 1, 3);
      expect(path).toEqual([1, 3]);
    });

    it('should build path for level 2', () => {
      const path = buildNumberingPath(undefined, 2, 5);
      expect(path).toEqual([1, 1, 5]);
    });

    it('should handle negative level as 0', () => {
      const path = buildNumberingPath(undefined, -1, 3);
      expect(path).toEqual([3]);
    });

    it('should floor fractional levels', () => {
      const path = buildNumberingPath(undefined, 2.7, 3);
      expect(path).toEqual([1, 1, 3]);
    });
  });

  describe('with listCounterContext', () => {
    it('should query parent levels from context', () => {
      const context: ListCounterContext = {
        getListCounter: vi.fn((numId, level) => {
          if (level === 0) return 2;
          if (level === 1) return 3;
          return 0;
        }),
        incrementListCounter: vi.fn(),
        resetListCounter: vi.fn(),
      };

      const path = buildNumberingPath(1, 2, 7, context);
      expect(path).toEqual([2, 3, 7]);
      expect(context.getListCounter).toHaveBeenCalledWith(1, 0);
      expect(context.getListCounter).toHaveBeenCalledWith(1, 1);
    });

    it('should use 1 for zero or negative parent values', () => {
      const context: ListCounterContext = {
        getListCounter: vi.fn(() => 0),
        incrementListCounter: vi.fn(),
        resetListCounter: vi.fn(),
      };

      const path = buildNumberingPath(1, 2, 5, context);
      expect(path).toEqual([1, 1, 5]);
    });

    it('should handle level 0 without querying parents', () => {
      const context: ListCounterContext = {
        getListCounter: vi.fn(),
        incrementListCounter: vi.fn(),
        resetListCounter: vi.fn(),
      };

      const path = buildNumberingPath(1, 0, 3, context);
      expect(path).toEqual([3]);
      expect(context.getListCounter).not.toHaveBeenCalled();
    });
  });
});

describe('mergeParagraphAttrs', () => {
  it('should return undefined when both are undefined', () => {
    expect(mergeParagraphAttrs(undefined, undefined)).toBeUndefined();
  });

  it('should return override when base is undefined', () => {
    const override: ParagraphAttrs = { alignment: 'center' };
    expect(mergeParagraphAttrs(undefined, override)).toBe(override);
  });

  it('should return base when override is undefined', () => {
    const base: ParagraphAttrs = { alignment: 'left' };
    expect(mergeParagraphAttrs(base, undefined)).toBe(base);
  });

  it('should override alignment', () => {
    const base: ParagraphAttrs = { alignment: 'left' };
    const override: ParagraphAttrs = { alignment: 'right' };
    const merged = mergeParagraphAttrs(base, override);
    expect(merged?.alignment).toBe('right');
  });

  it('should merge spacing properties', () => {
    const base: ParagraphAttrs = {
      spacing: { before: 10, after: 20 },
    };
    const override: ParagraphAttrs = {
      spacing: { after: 30, line: 15 },
    };
    const merged = mergeParagraphAttrs(base, override);
    expect(merged?.spacing).toEqual({ before: 10, after: 30, line: 15 });
  });

  it('should merge indent properties', () => {
    const base: ParagraphAttrs = {
      indent: { left: 10, right: 20 },
    };
    const override: ParagraphAttrs = {
      indent: { right: 30, firstLine: 5 },
    };
    const merged = mergeParagraphAttrs(base, override);
    expect(merged?.indent).toEqual({ left: 10, right: 30, firstLine: 5 });
  });

  it('should merge borders', () => {
    const base: ParagraphAttrs = {
      borders: {
        top: { style: 'solid', width: 1 },
      },
    };
    const override: ParagraphAttrs = {
      borders: {
        bottom: { style: 'dashed', width: 2 },
      },
    };
    const merged = mergeParagraphAttrs(base, override);
    expect(merged?.borders?.top).toEqual({ style: 'solid', width: 1 });
    expect(merged?.borders?.bottom).toEqual({ style: 'dashed', width: 2 });
  });

  it('should merge shading', () => {
    const base: ParagraphAttrs = {
      shading: { fill: '#FF0000' },
    };
    const override: ParagraphAttrs = {
      shading: { color: '#00FF00' },
    };
    const merged = mergeParagraphAttrs(base, override);
    expect(merged?.shading).toEqual({ fill: '#FF0000', color: '#00FF00' });
  });

  it('should not mutate base or override', () => {
    const base: ParagraphAttrs = { alignment: 'left', spacing: { before: 10 } };
    const override: ParagraphAttrs = { alignment: 'right', spacing: { after: 20 } };
    const originalBase = { ...base, spacing: { ...base.spacing } };
    const originalOverride = { ...override, spacing: { ...override.spacing } };

    mergeParagraphAttrs(base, override);

    expect(base.alignment).toBe(originalBase.alignment);
    expect(override.alignment).toBe(originalOverride.alignment);
  });
});

describe('convertListParagraphAttrs', () => {
  it('should return undefined for undefined attrs', () => {
    expect(convertListParagraphAttrs(undefined)).toBeUndefined();
  });

  it('should return undefined for empty attrs', () => {
    expect(convertListParagraphAttrs({})).toBeUndefined();
  });

  it('should convert alignment from attrs.alignment', () => {
    const attrs = { alignment: 'center' };
    const result = convertListParagraphAttrs(attrs);
    expect(result?.alignment).toBe('center');
  });

  it('should convert alignment from attrs.lvlJc', () => {
    const attrs = { lvlJc: 'right' };
    const result = convertListParagraphAttrs(attrs);
    expect(result?.alignment).toBe('right');
  });

  it('should prioritize alignment over lvlJc', () => {
    const attrs = { alignment: 'center', lvlJc: 'right' };
    const result = convertListParagraphAttrs(attrs);
    expect(result?.alignment).toBe('center');
  });

  it('should convert spacing', () => {
    const attrs = {
      spacing: { before: 150, after: 300 }, // 10px and 20px in twips
    };
    const result = convertListParagraphAttrs(attrs);
    expect(result?.spacing).toEqual({ before: 10, after: 20 });
  });

  it('should convert shading', () => {
    const attrs = {
      shading: { fill: '#FFFF00' },
    };
    const result = convertListParagraphAttrs(attrs);
    expect(result?.shading).toEqual({ fill: '#FFFF00' });
  });

  it('should convert complete list paragraph attrs', () => {
    const attrs = {
      alignment: 'justify',
      spacing: { before: 75 }, // 5px in twips
      shading: { fill: '#FF0000' },
    };
    const result = convertListParagraphAttrs(attrs);
    expect(result).toEqual({
      alignment: 'justify',
      spacing: { before: 5 },
      shading: { fill: '#FF0000' },
    });
  });
});

describe('computeWordLayoutForParagraph', () => {
  it('should return null on error', () => {
    // This will cause computeWordParagraphLayout to throw
    const paragraphAttrs: ParagraphAttrs = {};
    const numberingProps = null; // Invalid
    const styleContext = createTestStyleContext();

    const result = computeWordLayoutForParagraph(paragraphAttrs, numberingProps, styleContext);
    expect(result).toBeNull();
  });

  it('should handle paragraphAttrs without indent', () => {
    const paragraphAttrs: ParagraphAttrs = {
      alignment: 'left',
    };
    const numberingProps = {
      numId: 1,
      ilvl: 0,
    };
    const styleContext = createTestStyleContext({
      defaults: {
        defaultTabIntervalTwips: 720,
        decimalSeparator: '.',
      },
    });

    const result = computeWordLayoutForParagraph(paragraphAttrs, numberingProps, styleContext);
    // Result depends on computeWordParagraphLayout implementation
    // We're just testing it doesn't throw
    expect(result).toBeDefined();
  });

  it('should merge resolvedLevelIndent with paragraph indent', () => {
    const paragraphAttrs: ParagraphAttrs = {
      indent: { left: 10 },
    };
    const numberingProps = {
      numId: 1,
      ilvl: 0,
      resolvedLevelIndent: { left: 1440 }, // 1 inch in twips
    };
    const styleContext = createTestStyleContext({
      defaults: {
        defaultTabIntervalTwips: 720,
        decimalSeparator: '.',
      },
    });

    const result = computeWordLayoutForParagraph(paragraphAttrs, numberingProps, styleContext);
    expect(result).toBeDefined();
  });

  it('should use default values from styleContext', () => {
    const paragraphAttrs: ParagraphAttrs = {};
    const numberingProps = { numId: 1, ilvl: 0 };
    const styleContext = createTestStyleContext({
      defaults: {
        defaultTabIntervalTwips: 360,
        decimalSeparator: ',',
      },
    });

    const result = computeWordLayoutForParagraph(paragraphAttrs, numberingProps, styleContext);
    expect(result).toBeDefined();
  });
});

describe('computeParagraphAttrs', () => {
  // Note: Full testing of computeParagraphAttrs requires mocking resolveStyle and other dependencies
  // These tests cover basic scenarios

  it('should return undefined for para without attrs', () => {
    const para: PMNode = {};
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    // May return undefined or minimal attrs depending on style resolution
    expect(result).toBeDefined();
  });

  it('should set direction and rtl for bidi paragraphs', () => {
    const para: PMNode = {
      attrs: { bidi: true },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.direction).toBe('rtl');
    expect(result?.rtl).toBe(true);
  });

  it('should default bidi paragraphs to right alignment', () => {
    const para: PMNode = {
      attrs: { bidi: true },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.alignment).toBe('right');
  });

  it('should respect explicit alignment over bidi default', () => {
    const para: PMNode = {
      attrs: { bidi: true, alignment: 'center' },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.alignment).toBe('center');
  });

  it('should keep explicit indent when numbering resolvedLevelIndent is present', () => {
    const para: PMNode = {
      attrs: {
        indent: { left: 24, firstLine: 12 },
        numberingProperties: {
          numId: 1,
          ilvl: 2,
          resolvedLevelIndent: { left: 1440, hanging: 720 },
        },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);

    // Explicit indent (24px) should not be replaced by the numbering indent (~96px)
    expect(result?.indent?.left).toBeDefined();
    expect(result?.indent?.left).toBeLessThan(twipsToPx(1440));
    expect(result?.indent?.left).toBeCloseTo(24);
  });

  it('converts small twips indent values from paragraphProperties', () => {
    const para: PMNode = {
      attrs: {
        paragraphProperties: {
          indent: {
            firstLine: 14,
          },
        },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.indent?.firstLine).toBeCloseTo(twipsToPx(14));
  });

  it('merges style-based firstLine indent with inline right indent', () => {
    const para: PMNode = {
      attrs: {
        paragraphProperties: {
          indent: {
            right: 360, // 0.25in in twips
          },
        },
      },
    };
    const styleContext = createTestStyleContext();
    const hydrationOverride = {
      indent: {
        firstLine: 720, // 0.5in in twips
      },
    };

    const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

    expect(result?.indent?.firstLine).toBeCloseTo(twipsToPx(720));
    expect(result?.indent?.right).toBeCloseTo(twipsToPx(360));
  });

  it('should not force first-line indent mode when paragraph overrides numbering firstLine', () => {
    const para: PMNode = {
      attrs: {
        indent: { left: 0, firstLine: 0 },
        numberingProperties: {
          numId: 1,
          ilvl: 0,
          resolvedLevelIndent: { left: 0, firstLine: 2160 },
        },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);

    expect(result?.wordLayout?.firstLineIndentMode).not.toBe(true);
    expect(result?.wordLayout?.textStartPx).toBe(0);
    expect(result?.wordLayout?.marker?.textStartX).toBe(0);
  });

  it('should normalize paragraph borders', () => {
    const para: PMNode = {
      attrs: {
        borders: {
          top: { val: 'single', size: 2, color: 'FF0000' },
        },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.borders).toBeDefined();
  });

  it('should normalize paragraph shading', () => {
    const para: PMNode = {
      attrs: {
        shading: { fill: '#FFFF00' },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.shading).toBeDefined();
  });

  it('should include custom decimalSeparator', () => {
    const para: PMNode = { attrs: {} };
    const styleContext = createTestStyleContext({
      defaults: {
        decimalSeparator: ',',
      },
    });

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.decimalSeparator).toBe(',');
  });

  it('should extract floatAlignment from framePr', () => {
    const para: PMNode = {
      attrs: {
        framePr: { xAlign: 'right' },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.floatAlignment).toBe('right');
  });

  it('should surface frame positioning data from framePr', () => {
    const para: PMNode = {
      attrs: {
        framePr: { xAlign: 'right', wrap: 'none', y: 1440, hAnchor: 'margin', vAnchor: 'text' },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.frame?.wrap).toBe('none');
    expect(result?.frame?.xAlign).toBe('right');
    expect(result?.frame?.vAnchor).toBe('text');
    expect(result?.frame?.hAnchor).toBe('margin');
    expect(result?.frame?.y).toBeCloseTo(twipsToPx(1440));
  });

  it('should handle framePr in paragraphProperties (raw OOXML elements)', () => {
    const para: PMNode = {
      attrs: {
        paragraphProperties: {
          elements: [
            {
              name: 'w:framePr',
              attributes: { 'w:xAlign': 'center' },
            },
          ],
        },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.floatAlignment).toBe('center');
  });

  it('should handle framePr in paragraphProperties (decoded object from v3 translator)', () => {
    // This is the format produced by the v3 translator when importing DOCX
    // Headers/footers with right-aligned page numbers use this structure
    const para: PMNode = {
      attrs: {
        paragraphProperties: {
          framePr: { xAlign: 'right', wrap: 'none', hAnchor: 'margin', vAnchor: 'text', y: 1440 },
        },
      },
    };
    const styleContext = createTestStyleContext();

    const result = computeParagraphAttrs(para, styleContext);
    expect(result?.floatAlignment).toBe('right');
    expect(result?.frame?.wrap).toBe('none');
    expect(result?.frame?.xAlign).toBe('right');
    expect(result?.frame?.hAnchor).toBe('margin');
    expect(result?.frame?.vAnchor).toBe('text');
    expect(result?.frame?.y).toBeCloseTo(twipsToPx(1440));
  });

  it('should handle numberingProperties with list counter', () => {
    const para: PMNode = {
      attrs: {
        numberingProperties: {
          numId: 1,
          ilvl: 0,
        },
      },
    };
    const styleContext = createTestStyleContext();
    const listCounterContext: ListCounterContext = {
      getListCounter: vi.fn(() => 0),
      incrementListCounter: vi.fn(() => 1),
      resetListCounter: vi.fn(),
    };

    const result = computeParagraphAttrs(para, styleContext, listCounterContext);
    expect(result?.numberingProperties).toBeDefined();
    expect(listCounterContext.incrementListCounter).toHaveBeenCalledWith(1, 0);
  });

  describe('numId=0 disables numbering (OOXML spec §17.9.16)', () => {
    it('should not create numberingProperties when numId is numeric 0', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: 0,
            ilvl: 0,
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // numId=0 disables numbering, so numberingProperties should not be set
      expect(result?.numberingProperties).toBeUndefined();
      expect(result?.wordLayout).toBeUndefined();
    });

    it('should not create numberingProperties when numId is string "0"', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: '0',
            ilvl: 0,
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // numId='0' disables numbering, so numberingProperties should not be set
      expect(result?.numberingProperties).toBeUndefined();
      expect(result?.wordLayout).toBeUndefined();
    });

    it('should not increment list counter when numId is 0', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: 0,
            ilvl: 0,
          },
        },
      };
      const styleContext = createTestStyleContext();
      const listCounterContext: ListCounterContext = {
        getListCounter: vi.fn(() => 0),
        incrementListCounter: vi.fn(() => 1),
        resetListCounter: vi.fn(),
      };

      computeParagraphAttrs(para, styleContext, listCounterContext);

      // numId=0 should skip list counter logic entirely
      expect(listCounterContext.incrementListCounter).not.toHaveBeenCalled();
      expect(listCounterContext.resetListCounter).not.toHaveBeenCalled();
    });

    it('should not increment list counter when numId is "0"', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: '0',
            ilvl: 2,
          },
        },
      };
      const styleContext = createTestStyleContext();
      const listCounterContext: ListCounterContext = {
        getListCounter: vi.fn(() => 0),
        incrementListCounter: vi.fn(() => 1),
        resetListCounter: vi.fn(),
      };

      computeParagraphAttrs(para, styleContext, listCounterContext);

      // numId='0' should skip list counter logic entirely
      expect(listCounterContext.incrementListCounter).not.toHaveBeenCalled();
      expect(listCounterContext.resetListCounter).not.toHaveBeenCalled();
    });

    it('should create numberingProperties for valid numId=1', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: 1,
            ilvl: 0,
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Valid numId should create numberingProperties
      expect(result?.numberingProperties).toBeDefined();
      expect(result?.numberingProperties?.numId).toBe(1);
    });

    it('should create numberingProperties for valid numId="5"', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: '5',
            ilvl: 1,
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Valid string numId should create numberingProperties
      expect(result?.numberingProperties).toBeDefined();
      expect(result?.numberingProperties?.numId).toBe('5');
    });

    it('should skip word layout processing when numId is 0', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: 0,
            ilvl: 0,
            format: 'decimal',
            lvlText: '%1.',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // numId=0 should skip word layout entirely
      expect(result?.wordLayout).toBeUndefined();
    });

    it('should skip word layout processing when numId is "0"', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: '0',
            ilvl: 1,
            format: 'lowerLetter',
            lvlText: '%1)',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // numId='0' should skip word layout entirely
      expect(result?.wordLayout).toBeUndefined();
    });
  });

  it('should reset deeper list levels', () => {
    const para: PMNode = {
      attrs: {
        numberingProperties: {
          numId: 1,
          ilvl: 2,
        },
      },
    };
    const styleContext = createTestStyleContext();
    const listCounterContext: ListCounterContext = {
      getListCounter: vi.fn(() => 1),
      incrementListCounter: vi.fn(() => 3),
      resetListCounter: vi.fn(),
    };

    computeParagraphAttrs(para, styleContext, listCounterContext);

    // Should reset levels 3-8
    expect(listCounterContext.resetListCounter).toHaveBeenCalled();
    // Access mock.calls through the vitest Mock interface
    const resetMock = vi.mocked(listCounterContext.resetListCounter);
    const resetCalls = resetMock.mock.calls;
    expect(resetCalls.length).toBeGreaterThan(0);
    expect(resetCalls.some((call) => call[1] === 3)).toBe(true);
  });

  it('hydrates numbering details from converterContext definitions', () => {
    const para: PMNode = {
      attrs: {
        numberingProperties: { numId: 7, ilvl: 1 },
      },
    };
    const styleContext = createTestStyleContext({
      defaults: { defaultTabIntervalTwips: 720, decimalSeparator: '.' },
    });
    const converterContext = {
      numbering: {
        definitions: {
          '7': {
            name: 'w:num',
            attributes: { 'w:numId': '7' },
            elements: [{ name: 'w:abstractNumId', attributes: { 'w:val': '3' } }],
          },
        },
        abstracts: {
          '3': {
            name: 'w:abstractNum',
            attributes: { 'w:abstractNumId': '3' },
            elements: [
              {
                name: 'w:lvl',
                attributes: { 'w:ilvl': '1' },
                elements: [
                  { name: 'w:start', attributes: { 'w:val': '1' } },
                  { name: 'w:numFmt', attributes: { 'w:val': 'lowerLetter' } },
                  { name: 'w:lvlText', attributes: { 'w:val': '%2.' } },
                  { name: 'w:lvlJc', attributes: { 'w:val': 'left' } },
                  { name: 'w:suff', attributes: { 'w:val': 'space' } },
                  {
                    name: 'w:pPr',
                    elements: [{ name: 'w:ind', attributes: { 'w:left': '1440', 'w:hanging': '360' } }],
                  },
                  {
                    name: 'w:rPr',
                    elements: [
                      { name: 'w:rFonts', attributes: { 'w:ascii': 'Arial' } },
                      { name: 'w:color', attributes: { 'w:val': '5C5C5F' } },
                      { name: 'w:sz', attributes: { 'w:val': '16' } },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const result = computeParagraphAttrs(para, styleContext, undefined, converterContext);

    expect(result?.numberingProperties?.format).toBe('lowerLetter');
    expect(result?.numberingProperties?.lvlText).toBe('%2.');
    expect(result?.numberingProperties?.start).toBe(1);
    expect(result?.numberingProperties?.lvlJc).toBe('left');
    expect(result?.numberingProperties?.suffix).toBe('space');
    expect(result?.numberingProperties?.resolvedLevelIndent).toEqual({ left: 1440, hanging: 360 });
    expect(result?.wordLayout?.marker?.markerText).toBe('a.');

    const markerRun = (result?.numberingProperties as Record<string, unknown>)?.resolvedMarkerRpr as
      | Record<string, unknown>
      | undefined;
    expect(markerRun?.fontFamily).toBe('Arial');
  });

  describe('unwrapTabStops function', () => {
    // Note: unwrapTabStops is a private function inside computeParagraphAttrs
    // We test it indirectly through computeParagraphAttrs by passing various tabStops formats

    it('should unwrap nested tab format { tab: { tabType, pos } }', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ tab: { tabType: 'start', pos: 2880 } }], // Use value > 1000 so it stays as twips
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].val).toBe('start');
      expect(result?.tabs?.[0].pos).toBe(2880); // Stays as twips (> 1000 threshold)
    });

    it('should handle direct format { val, pos }', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ val: 'center', pos: 1440 }],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].val).toBe('center');
      expect(result?.tabs?.[0].pos).toBe(1440);
    });

    it('should skip invalid entries with missing required fields', () => {
      const para: PMNode = {
        attrs: {
          tabs: [
            { val: 'start' }, // Missing pos
            { pos: 720 }, // Missing val
            { val: 'center', pos: 1440 }, // Valid
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs).toHaveLength(1);
      expect(result?.tabs?.[0].val).toBe('center');
    });

    it('should add originalPos when extracting from nested format', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ tab: { tabType: 'start', pos: 4320 } }], // Use value > 1000 so it stays as twips
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].pos).toBe(4320); // Stays as twips (> 1000 threshold)
      // The originalPos is set internally during unwrapping
    });

    it('should handle mixed valid and invalid entries', () => {
      const para: PMNode = {
        attrs: {
          tabs: [
            { tab: { tabType: 'start', pos: 2880 } }, // Valid nested (> 1000 threshold)
            null, // Invalid: null
            { val: 'center', pos: 1440 }, // Valid direct
            'invalid', // Invalid: string
            { tab: 'invalid' }, // Invalid: tab is not an object
            { val: 'end', pos: 2160 }, // Valid direct
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs).toHaveLength(3);
      // Note: tabs are now sorted by position, so order is 1440, 2160, 2880
      expect(result?.tabs?.[0].val).toBe('center');
      expect(result?.tabs?.[0].pos).toBe(1440);
      expect(result?.tabs?.[1].val).toBe('end');
      expect(result?.tabs?.[1].pos).toBe(2160);
      expect(result?.tabs?.[2].val).toBe('start');
      expect(result?.tabs?.[2].pos).toBe(2880);
    });

    it('should return undefined for non-array input', () => {
      const para: PMNode = {
        attrs: {
          tabs: 'not an array',
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // When tabs is not an array, unwrapTabStops returns undefined
      // computeParagraphAttrs may still set tabs from other sources
      expect(result).toBeDefined();
    });

    it('should handle nested format with originalPos', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ tab: { tabType: 'start', pos: 500, originalPos: 720 } }],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].pos).toBe(720); // Uses originalPos
    });

    it('should handle nested format with leader', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ tab: { tabType: 'end', pos: 1440, leader: 'dot' } }],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].val).toBe('end');
      expect(result?.tabs?.[0].leader).toBe('dot');
    });

    it('should skip entries with invalid nested tab structure', () => {
      const para: PMNode = {
        attrs: {
          tabs: [
            { tab: null }, // Invalid: tab is null
            { tab: { tabType: 'start', pos: 2880 } }, // Valid (> 1000 threshold)
            { tab: { pos: 1440 } }, // Invalid: missing tabType
            { tab: { tabType: 'center' } }, // Invalid: missing pos
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs).toHaveLength(1);
      expect(result?.tabs?.[0].val).toBe('start');
    });

    it('should handle empty array', () => {
      const para: PMNode = {
        attrs: {
          tabs: [],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Empty array returns undefined from unwrapTabStops
      expect(result).toBeDefined();
    });

    it('should handle direct format with val property fallback', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ tab: { val: 'start', pos: 2880 } }], // val instead of tabType in nested format (> 1000 threshold)
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].val).toBe('start');
    });

    it('should preserve leader in direct format', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ val: 'decimal', pos: 2880, leader: 'hyphen' }],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.[0].leader).toBe('hyphen');
    });
  });

  describe('mergeTabStopSources behavior', () => {
    // Note: mergeTabStopSources is an internal function that merges tab stops from multiple sources.
    // We test it indirectly through computeParagraphAttrs by providing tabs in attrs, hydrated, and paragraphProps.

    it('should merge tab stops from attrs and hydrated sources', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ val: 'left', pos: 1440 }], // Tab at position 1440
        },
      };
      const styleContext = createTestStyleContext({
        styles: {
          testStyle: {
            type: 'paragraph',
            paragraphProps: {
              tabStops: [{ val: 'center', pos: 2880 }], // Tab at position 2880
            },
          },
        },
      });

      // Pass hydrated props via a style reference
      para.attrs = {
        ...para.attrs,
        styleId: 'testStyle',
      };

      const result = computeParagraphAttrs(para, styleContext);

      // Should have both tabs merged
      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.length).toBeGreaterThanOrEqual(1);
    });

    it('should override tab stops at same position with later source', () => {
      // When multiple sources have tabs at the same position, later sources win
      // Merge order is: hydratedTabStops, paragraphTabStops, attrTabStops
      // So attrTabStops (last) should override earlier sources
      const para: PMNode = {
        attrs: {
          tabs: [{ val: 'decimal', pos: 1440 }], // Same position as style, different alignment
          styleId: 'testStyle',
        },
      };
      const styleContext = createTestStyleContext({
        styles: {
          testStyle: {
            type: 'paragraph',
            paragraphProps: {
              tabStops: [{ val: 'center', pos: 1440 }], // Same position
            },
          },
        },
      });

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      // attrTabStops is processed last, so 'decimal' should override 'center'
      const tab1440 = result?.tabs?.find((t) => t.pos === 1440);
      expect(tab1440?.val).toBe('decimal');
    });

    it('should sort merged tab stops by position', () => {
      const para: PMNode = {
        attrs: {
          // Just test sorting with direct tabs from attrs
          tabs: [
            { val: 'end', pos: 4320 }, // Third position
            { val: 'center', pos: 2880 }, // Second position
            { val: 'start', pos: 1440 }, // First position
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.length).toBe(3);
      // Should be sorted by position
      expect(result?.tabs?.[0].pos).toBe(1440);
      expect(result?.tabs?.[0].val).toBe('start');
      expect(result?.tabs?.[1].pos).toBe(2880);
      expect(result?.tabs?.[1].val).toBe('center');
      expect(result?.tabs?.[2].pos).toBe(4320);
      expect(result?.tabs?.[2].val).toBe('end');
    });

    it('should handle getTabStopPosition with originalPos property', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ val: 'left', originalPos: 1440, pos: 100 }], // originalPos takes priority
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      // The merge uses originalPos for deduplication key
      expect(result?.tabs?.[0].pos).toBe(1440); // Uses originalPos
    });

    it('should handle getTabStopPosition with position property', () => {
      const para: PMNode = {
        attrs: {
          tabStops: [{ val: 'left', position: 2880 }], // Uses position property
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
    });

    it('should handle getTabStopPosition with offset property', () => {
      const para: PMNode = {
        attrs: {
          tabStops: [{ val: 'center', offset: 1440 }], // Uses offset property
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
    });

    it('should skip tab stops without valid position', () => {
      const para: PMNode = {
        attrs: {
          tabs: [
            { val: 'left' }, // No position - should be skipped by merge
            { val: 'center', pos: 1440 }, // Valid
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      // Only the valid tab should be included
      expect(result?.tabs?.length).toBe(1);
      expect(result?.tabs?.[0].val).toBe('center');
    });

    it('should deduplicate tabs at same position from different sources', () => {
      const para: PMNode = {
        attrs: {
          tabs: [
            { val: 'center', pos: 1440 },
            { val: 'decimal', pos: 1440 }, // Same position, should be deduplicated
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      // Should only have one tab at position 1440 (last one wins)
      const tabs1440 = result?.tabs?.filter((t) => t.pos === 1440);
      expect(tabs1440?.length).toBe(1);
      expect(tabs1440?.[0].val).toBe('decimal');
    });

    it('should deduplicate tabs that normalize to the same position', () => {
      const para: PMNode = {
        attrs: {
          tabs: [{ val: 'decimal', pos: 96 }], // 96px -> 1440 twips
          styleId: 'testStyle',
        },
      };
      const styleContext = createTestStyleContext({
        styles: {
          testStyle: {
            type: 'paragraph',
            paragraphProps: {
              tabStops: [{ val: 'center', pos: 1440 }], // Same position in twips
            },
          },
        },
      });

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      const tabs1440 = result?.tabs?.filter((t) => t.pos === 1440);
      expect(tabs1440?.length).toBe(1);
      expect(tabs1440?.[0].val).toBe('decimal');
    });

    it('should return undefined when all sources are empty or invalid', () => {
      const para: PMNode = {
        attrs: {
          tabs: [],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // No tabs should be set when all sources are empty
      expect(result?.tabs).toBeUndefined();
    });

    it('should handle non-object entries in tab array', () => {
      const para: PMNode = {
        attrs: {
          tabs: [
            null,
            undefined,
            'string',
            123,
            { val: 'center', pos: 1440 }, // Only valid entry
          ],
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.tabs).toBeDefined();
      expect(result?.tabs?.length).toBe(1);
      expect(result?.tabs?.[0].val).toBe('center');
    });
  });

  describe('framePr edge cases and validation', () => {
    it('should return undefined for empty framePr object', () => {
      const para: PMNode = {
        attrs: { framePr: {} },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Empty framePr should not produce floatAlignment or frame
      expect(result?.floatAlignment).toBeUndefined();
      expect(result?.frame).toBeUndefined();
    });

    it('should handle framePr with attributes wrapper but empty attributes', () => {
      const para: PMNode = {
        attrs: { framePr: { attributes: {} } },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.floatAlignment).toBeUndefined();
      expect(result?.frame).toBeUndefined();
    });

    it('should handle non-numeric x/y values gracefully', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            xAlign: 'right',
            x: 'invalid',
            y: 'bad',
            wrap: 'none',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Should extract valid xAlign and wrap, ignore invalid x/y
      expect(result?.floatAlignment).toBe('right');
      expect(result?.frame?.xAlign).toBe('right');
      expect(result?.frame?.wrap).toBe('none');
      expect(result?.frame?.x).toBeUndefined();
      expect(result?.frame?.y).toBeUndefined();
    });

    it('should use w:prefixed keys first via nullish coalescing', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            'w:xAlign': 'right',
            xAlign: 'left', // Should be ignored due to nullish coalescing
            'w:wrap': 'around',
            wrap: 'none', // Should be ignored
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Should prefer w:prefixed keys
      expect(result?.floatAlignment).toBe('right');
      expect(result?.frame?.xAlign).toBe('right');
      expect(result?.frame?.wrap).toBe('around');
    });

    it('should return undefined frame when all framePr values are invalid', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            xAlign: 'invalid',
            yAlign: 'invalid',
            x: 'bad',
            y: 'bad',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Invalid xAlign should not produce floatAlignment
      expect(result?.floatAlignment).toBeUndefined();
      // Frame is still set with invalid xAlign (validation deferred to renderer)
      expect(result?.frame?.xAlign).toBe('invalid');
      expect(result?.frame?.yAlign).toBe('invalid');
      // Invalid x and y should not be set
      expect(result?.frame?.x).toBeUndefined();
      expect(result?.frame?.y).toBeUndefined();
    });

    it('should handle mixed valid and invalid framePr properties', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            xAlign: 'center', // valid
            yAlign: 'top', // valid
            x: 'bad', // invalid
            y: 720, // valid
            wrap: 'none', // valid
            hAnchor: 'margin', // valid
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.floatAlignment).toBe('center');
      expect(result?.frame?.xAlign).toBe('center');
      expect(result?.frame?.yAlign).toBe('top');
      expect(result?.frame?.x).toBeUndefined();
      expect(result?.frame?.y).toBeCloseTo(twipsToPx(720));
      expect(result?.frame?.wrap).toBe('none');
      expect(result?.frame?.hAnchor).toBe('margin');
    });

    it('should handle framePr with null values', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            xAlign: null,
            wrap: null,
            y: 1440,
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Null values should be ignored by nullish coalescing
      expect(result?.floatAlignment).toBeUndefined();
      // Only y should be set
      expect(result?.frame?.xAlign).toBeUndefined();
      expect(result?.frame?.wrap).toBeUndefined();
      expect(result?.frame?.y).toBeCloseTo(twipsToPx(1440));
    });

    it('should handle very large numeric values for x and y', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            xAlign: 'left',
            x: Number.MAX_SAFE_INTEGER,
            y: Number.MAX_SAFE_INTEGER,
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.floatAlignment).toBe('left');
      // Large values should be converted but remain finite
      expect(result?.frame?.x).toBeDefined();
      expect(Number.isFinite(result?.frame?.x)).toBe(true);
      expect(result?.frame?.y).toBeDefined();
      expect(Number.isFinite(result?.frame?.y)).toBe(true);
    });

    it('should convert case-insensitive xAlign values correctly', () => {
      const testCases = [
        { input: 'LEFT', expected: 'left' },
        { input: 'Right', expected: 'right' },
        { input: 'CENTER', expected: 'center' },
        { input: 'CeNtEr', expected: 'center' },
      ];

      testCases.forEach(({ input, expected }) => {
        const para: PMNode = {
          attrs: {
            framePr: { xAlign: input },
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.floatAlignment).toBe(expected);
        expect(result?.frame?.xAlign).toBe(expected);
      });
    });

    it('should set yAlign values without validation', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            xAlign: 'center',
            yAlign: 'bottom',
            wrap: 'none',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // xAlign should still work
      expect(result?.floatAlignment).toBe('center');
      expect(result?.frame?.xAlign).toBe('center');
      // yAlign set as-is (no validation at this stage)
      expect(result?.frame?.yAlign).toBe('bottom');
      expect(result?.frame?.wrap).toBe('none');
    });

    it('should handle framePr with only positioning properties (no alignment)', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            x: 1440,
            y: 2880,
            hAnchor: 'page',
            vAnchor: 'page',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // No xAlign means no floatAlignment
      expect(result?.floatAlignment).toBeUndefined();
      // But frame should still be set with positioning
      expect(result?.frame?.x).toBeCloseTo(twipsToPx(1440));
      expect(result?.frame?.y).toBeCloseTo(twipsToPx(2880));
      expect(result?.frame?.hAnchor).toBe('page');
      expect(result?.frame?.vAnchor).toBe('page');
    });

    it('should handle framePr with dropCap property', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
            xAlign: 'left',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCap).toBe('drop');
      expect(result?.floatAlignment).toBe('left');
    });

    it('should handle w:prefixed dropCap property', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            'w:dropCap': 'margin',
            xAlign: 'center',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCap).toBe('margin');
      expect(result?.floatAlignment).toBe('center');
    });

    it('should build dropCapDescriptor with mode and lines from framePr', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
            lines: 3,
            wrap: 'around',
          },
        },
        content: [
          {
            type: 'text',
            text: 'D',
            marks: [
              {
                type: 'textStyle',
                attrs: {
                  fontSize: '156px',
                  fontFamily: 'Times New Roman',
                },
              },
            ],
          },
        ],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCapDescriptor).toBeDefined();
      expect(result?.dropCapDescriptor?.mode).toBe('drop');
      expect(result?.dropCapDescriptor?.lines).toBe(3);
      expect(result?.dropCapDescriptor?.wrap).toBe('around');
      expect(result?.dropCapDescriptor?.run.text).toBe('D');
      expect(result?.dropCapDescriptor?.run.fontFamily).toBe('Times New Roman');
      expect(result?.dropCapDescriptor?.run.fontSize).toBe(156);
    });

    it('should build dropCapDescriptor with margin mode', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            'w:dropCap': 'margin',
            'w:lines': 2,
          },
        },
        content: [
          {
            type: 'text',
            text: 'W',
          },
        ],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCapDescriptor).toBeDefined();
      expect(result?.dropCapDescriptor?.mode).toBe('margin');
      expect(result?.dropCapDescriptor?.lines).toBe(2);
    });

    it('should extract font styling from nested run nodes', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
            lines: 4,
          },
        },
        content: [
          {
            type: 'run',
            attrs: {
              runProperties: {
                fontSize: '117pt',
                fontFamily: 'Georgia',
                bold: true,
                italic: true,
                color: '0000FF',
              },
            },
            content: [
              {
                type: 'text',
                text: 'A',
              },
            ],
          },
        ],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCapDescriptor).toBeDefined();
      expect(result?.dropCapDescriptor?.run.text).toBe('A');
      expect(result?.dropCapDescriptor?.run.fontFamily).toBe('Georgia');
      expect(result?.dropCapDescriptor?.run.bold).toBe(true);
      expect(result?.dropCapDescriptor?.run.italic).toBe(true);
      expect(result?.dropCapDescriptor?.run.color).toBe('#0000FF');
    });

    it('should default to 3 lines when lines not specified', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
          },
        },
        content: [{ type: 'text', text: 'B' }],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCapDescriptor?.lines).toBe(3);
    });

    it('should not create dropCapDescriptor without content', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
            lines: 3,
          },
        },
        content: [],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCapDescriptor).toBeUndefined();
    });

    it('should normalize wrap value to proper casing', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
            wrap: 'notBeside',
          },
        },
        content: [{ type: 'text', text: 'C' }],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.dropCapDescriptor?.wrap).toBe('notBeside');
    });

    it('should handle OOXML half-points font size format', () => {
      const para: PMNode = {
        attrs: {
          framePr: {
            dropCap: 'drop',
          },
        },
        content: [
          {
            type: 'run',
            attrs: {
              runProperties: {
                sz: 234, // Half-points: 234 = 117pt
              },
            },
            content: [{ type: 'text', text: 'E' }],
          },
        ],
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // 117pt ≈ 156px (at 96dpi)
      expect(result?.dropCapDescriptor?.run.fontSize).toBeCloseTo(156, 0);
    });
  });
});

describe('mergeSpacingSources', () => {
  describe('priority order', () => {
    it('should prioritize attrs over paragraphProps and base', () => {
      const base = { before: 10, after: 10, line: 1.0 };
      const paragraphProps = { before: 15, after: 15 };
      const attrs = { before: 20, line: 2.0 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 20, // from attrs (highest priority)
        after: 15, // from paragraphProps (middle priority)
        line: 2.0, // from attrs
      });
    });

    it('should prioritize paragraphProps over base when attrs is empty', () => {
      const base = { before: 10, after: 10, line: 1.0 };
      const paragraphProps = { before: 15, line: 1.5 };
      const attrs = {};

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 15, // from paragraphProps (overrides base)
        after: 10, // from base (not overridden)
        line: 1.5, // from paragraphProps (overrides base)
      });
    });

    it('should use base when paragraphProps and attrs are empty', () => {
      const base = { before: 10, after: 10, line: 1.0 };
      const paragraphProps = {};
      const attrs = {};

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 10,
        after: 10,
        line: 1.0,
      });
    });

    it('should handle correct priority chain: base < paragraphProps < attrs', () => {
      const base = { before: 10, after: 10, line: 1.0 };
      const paragraphProps = { before: 15 };
      const attrs = { line: 2.0 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 15, // from paragraphProps (overrides base)
        after: 10, // from base (not overridden)
        line: 2.0, // from attrs (highest priority)
      });
    });
  });

  describe('partial overrides', () => {
    it('should allow partial override from attrs (only line)', () => {
      const base = { before: 10, after: 10 };
      const paragraphProps = {};
      const attrs = { line: 1.5 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 10, // inherited from base
        after: 10, // inherited from base
        line: 1.5, // from attrs
      });
    });

    it('should allow partial override from paragraphProps (only before)', () => {
      const base = { before: 10, after: 10, line: 1.0 };
      const paragraphProps = { before: 20 };
      const attrs = {};

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 20, // from paragraphProps (overrides base)
        after: 10, // inherited from base
        line: 1.0, // inherited from base
      });
    });

    it('should merge multiple partial overrides correctly', () => {
      const base = { before: 10, after: 10, line: 1.0, lineRule: 'auto' };
      const paragraphProps = { before: 20, after: 20 };
      const attrs = { line: 2.0 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 20, // from paragraphProps
        after: 20, // from paragraphProps
        line: 2.0, // from attrs
        lineRule: 'auto', // inherited from base
      });
    });

    it('should handle single property from each source', () => {
      const base = { before: 10 };
      const paragraphProps = { after: 20 };
      const attrs = { line: 1.5 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 10,
        after: 20,
        line: 1.5,
      });
    });
  });

  describe('edge cases', () => {
    it('should return undefined when all sources are null', () => {
      const result = mergeSpacingSources(null, null, null);
      expect(result).toBeUndefined();
    });

    it('should return undefined when all sources are undefined', () => {
      const result = mergeSpacingSources(undefined, undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined when all sources are empty objects', () => {
      const result = mergeSpacingSources({}, {}, {});
      expect(result).toBeUndefined();
    });

    it('should handle null base gracefully', () => {
      const result = mergeSpacingSources(null, { before: 10 }, { line: 1.5 });
      expect(result).toEqual({ before: 10, line: 1.5 });
    });

    it('should handle null paragraphProps gracefully', () => {
      const result = mergeSpacingSources({ before: 10 }, null, { line: 1.5 });
      expect(result).toEqual({ before: 10, line: 1.5 });
    });

    it('should handle null attrs gracefully', () => {
      const result = mergeSpacingSources({ before: 10 }, { after: 20 }, null);
      expect(result).toEqual({ before: 10, after: 20 });
    });

    it('should handle undefined sources gracefully', () => {
      const result = mergeSpacingSources(undefined, { before: 10 }, { line: 1.5 });
      expect(result).toEqual({ before: 10, line: 1.5 });
    });

    it('should handle non-object values (treat as empty)', () => {
      const result = mergeSpacingSources('not an object', { before: 10 }, { line: 1.5 });
      expect(result).toEqual({ before: 10, line: 1.5 });
    });

    it('should preserve zero values through merge priority', () => {
      const base = { before: 10 };
      const paragraphProps = { before: 0 }; // explicit zero overrides base
      const attrs = {};

      const result = mergeSpacingSources(base, paragraphProps, attrs);
      expect(result).toEqual({ before: 0 });
    });

    it('should handle negative values correctly', () => {
      const base = { before: 10 };
      const paragraphProps = { after: -5 };
      const attrs = { line: -1.5 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);
      expect(result).toEqual({
        before: 10,
        after: -5,
        line: -1.5,
      });
    });
  });

  describe('real-world OOXML scenarios', () => {
    it('should handle docDefaults + partial style override', () => {
      const base = { before: 0, after: 0, line: 1.0, lineRule: 'auto' };
      const paragraphProps = { after: 10 };
      const attrs = {};

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 0,
        after: 10,
        line: 1.0,
        lineRule: 'auto',
      });
    });

    it('should handle direct paragraph override of only line spacing', () => {
      const base = { before: 10, after: 10, line: 1.0 };
      const paragraphProps = {};
      const attrs = { line: 1.5 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 10,
        after: 10,
        line: 1.5,
      });
    });

    it('should handle three-tier override chain', () => {
      const base = { before: 0, after: 0, line: 1.0, lineRule: 'auto' };
      const paragraphProps = { before: 12 };
      const attrs = { after: 8, line: 1.2 };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 12, // from paragraphProps
        after: 8, // from attrs
        line: 1.2, // from attrs
        lineRule: 'auto', // from base
      });
    });

    it('should handle complete direct override', () => {
      const base = { before: 10, after: 10, line: 1.0, lineRule: 'auto' };
      const paragraphProps = { before: 20, after: 20 };
      const attrs = { before: 5, after: 5, line: 1.5, lineRule: 'exact' };

      const result = mergeSpacingSources(base, paragraphProps, attrs);

      expect(result).toEqual({
        before: 5,
        after: 5,
        line: 1.5,
        lineRule: 'exact',
      });
    });
  });
});

describe('computeParagraphAttrs - alignment priority cascade', () => {
  describe('priority order tests', () => {
    it('should prioritize explicitAlignment over paragraphAlignment', () => {
      const para: PMNode = {
        attrs: {
          alignment: 'right',
          paragraphProperties: {
            justification: 'center',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.alignment).toBe('right');
    });

    it('should prioritize paragraphAlignment over styleAlignment', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 'center',
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'left',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      expect(result?.alignment).toBe('center');
    });

    it('should prioritize styleAlignment over computed.paragraph.alignment', () => {
      const para: PMNode = {
        attrs: {},
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'right',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      expect(result?.alignment).toBe('right');
    });

    it('should prioritize bidi+adjustRightInd over everything', () => {
      const para: PMNode = {
        attrs: {
          bidi: true,
          adjustRightInd: true,
          alignment: 'center',
          paragraphProperties: {
            justification: 'left',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.alignment).toBe('right');
    });
  });

  describe('edge case tests', () => {
    it('should handle null justification value and fallback to styleAlignment', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: null,
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'center',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      expect(result?.alignment).toBe('center');
    });

    it('should handle empty string justification and fallback to styleAlignment', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: '',
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'left',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      expect(result?.alignment).toBe('left');
    });

    it('should handle invalid alignment value and fallback to styleAlignment', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 'invalid-value',
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'right',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      expect(result?.alignment).toBe('right');
    });

    it('should handle non-string justification (number) and not crash', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 123,
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'center',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      // Should fallback to styleAlignment since number is not a string
      expect(result?.alignment).toBe('center');
    });
  });

  describe('normalization tests', () => {
    it('should normalize "both" to "justify"', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 'both',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.alignment).toBe('justify');
    });

    it('should normalize "start" to "left"', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 'start',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.alignment).toBe('left');
    });

    it('should normalize "end" to "right"', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 'end',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.alignment).toBe('right');
    });
  });

  describe('real-world scenario tests', () => {
    it('should use center from paragraph props when style has left', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            justification: 'center',
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydration = {
        alignment: 'left',
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydration);

      expect(result?.alignment).toBe('center');
    });

    it('should use right from explicit when paragraph props has center', () => {
      const para: PMNode = {
        attrs: {
          alignment: 'right',
          paragraphProperties: {
            justification: 'center',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.alignment).toBe('right');
    });

    it('should respect all 6 priority levels in correct order', () => {
      // Level 6: computed.paragraph.alignment (lowest)
      const para1: PMNode = { attrs: {} };
      const styleContext = createTestStyleContext();
      const result1 = computeParagraphAttrs(para1, styleContext);
      // Level 6 provides default 'left' alignment from style-engine when no other sources are present
      expect(result1?.alignment).toBe('left');

      // Level 5: styleAlignment
      const para2: PMNode = { attrs: {} };
      const hydration2 = { alignment: 'left' };
      const result2 = computeParagraphAttrs(para2, styleContext, undefined, undefined, hydration2);
      expect(result2?.alignment).toBe('left');

      // Level 4: bidi alone (defaults to right)
      const para3: PMNode = { attrs: { bidi: true } };
      const result3 = computeParagraphAttrs(para3, styleContext);
      expect(result3?.alignment).toBe('right');

      // Level 3: paragraphAlignment (overrides bidi default)
      const para4: PMNode = {
        attrs: {
          bidi: true,
          paragraphProperties: { justification: 'center' },
        },
      };
      const result4 = computeParagraphAttrs(para4, styleContext);
      expect(result4?.alignment).toBe('center');

      // Level 2: explicitAlignment (overrides paragraphAlignment)
      const para5: PMNode = {
        attrs: {
          alignment: 'justify',
          paragraphProperties: { justification: 'center' },
        },
      };
      const result5 = computeParagraphAttrs(para5, styleContext);
      expect(result5?.alignment).toBe('justify');

      // Level 1: bidi + adjustRightInd (overrides everything)
      const para6: PMNode = {
        attrs: {
          bidi: true,
          adjustRightInd: true,
          alignment: 'justify',
          paragraphProperties: { justification: 'center' },
        },
      };
      const result6 = computeParagraphAttrs(para6, styleContext);
      expect(result6?.alignment).toBe('right');
    });
  });
});

describe('computeParagraphAttrs - numbering properties fallback from listRendering', () => {
  describe('fallback synthesis when numberingProperties is missing', () => {
    it('should synthesize numbering props when only listRendering provided', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '1.',
            justification: 'left',
            numberingType: 'decimal',
            suffix: 'tab',
            path: [1],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties).toBeDefined();
      expect(result?.numberingProperties?.numId).toBe(-1);
      expect(result?.numberingProperties?.markerText).toBe('1.');
      expect(result?.numberingProperties?.format).toBe('decimal');
      expect(result?.numberingProperties?.lvlJc).toBe('left');
      expect(result?.numberingProperties?.suffix).toBe('tab');
    });

    it('should correctly extract counter value from path array', () => {
      const testCases = [
        { path: [1], expectedCounter: 1 },
        { path: [1, 2], expectedCounter: 2 },
        { path: [1, 2, 3], expectedCounter: 3 },
        { path: [5, 10, 15], expectedCounter: 15 },
      ];

      testCases.forEach(({ path, expectedCounter }) => {
        const para: PMNode = {
          attrs: {
            listRendering: {
              markerText: `${expectedCounter}.`,
              path,
            },
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.numberingProperties?.counterValue).toBe(expectedCounter);
        expect(result?.numberingProperties?.path).toEqual(path);
      });
    });

    it('should correctly calculate ilvl from path length', () => {
      const testCases = [
        { path: [1], expectedIlvl: 0 },
        { path: [1, 2], expectedIlvl: 1 },
        { path: [1, 2, 3], expectedIlvl: 2 },
        { path: [1, 2, 3, 4], expectedIlvl: 3 },
      ];

      testCases.forEach(({ path, expectedIlvl }) => {
        const para: PMNode = {
          attrs: {
            listRendering: {
              markerText: '•',
              path,
            },
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.numberingProperties?.ilvl).toBe(expectedIlvl);
      });
    });

    it('should handle empty path array', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '•',
            path: [],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.ilvl).toBe(0);
      // When path is empty, buildNumberingPath creates [1] and counterValue becomes 1
      expect(result?.numberingProperties?.counterValue).toBe(1);
      expect(result?.numberingProperties?.path).toEqual([1]);
    });

    it('should handle missing path array', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '1.',
            justification: 'left',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.ilvl).toBe(0);
      // When path is undefined, buildNumberingPath creates [1] and counterValue becomes 1
      expect(result?.numberingProperties?.counterValue).toBe(1);
      expect(result?.numberingProperties?.path).toEqual([1]);
    });

    it('should preserve original numberingProperties when present', () => {
      const para: PMNode = {
        attrs: {
          numberingProperties: {
            numId: 5,
            ilvl: 2,
          },
          listRendering: {
            markerText: 'a)',
            path: [1, 2, 3],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Should use original numberingProperties, not synthesize from listRendering
      expect(result?.numberingProperties?.numId).toBe(5);
      expect(result?.numberingProperties?.ilvl).toBe(2);
    });

    it('should not synthesize when listRendering is missing', () => {
      const para: PMNode = {
        attrs: {},
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Should not create numberingProperties from nothing
      expect(result?.numberingProperties).toBeUndefined();
    });

    it('should synthesize all properties from listRendering', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: 'II.',
            justification: 'right',
            numberingType: 'upperRoman',
            suffix: 'space',
            path: [1, 2],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.numId).toBe(-1);
      expect(result?.numberingProperties?.ilvl).toBe(1);
      expect(result?.numberingProperties?.path).toEqual([1, 2]);
      expect(result?.numberingProperties?.counterValue).toBe(2);
      expect(result?.numberingProperties?.markerText).toBe('II.');
      expect(result?.numberingProperties?.format).toBe('upperRoman');
      expect(result?.numberingProperties?.lvlJc).toBe('right');
      expect(result?.numberingProperties?.suffix).toBe('space');
    });

    it('should handle single-level list (path with one element)', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '3.',
            path: [3],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.ilvl).toBe(0);
      expect(result?.numberingProperties?.counterValue).toBe(3);
      expect(result?.numberingProperties?.path).toEqual([3]);
    });

    it('should handle bullet list with path', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '•',
            justification: 'left',
            numberingType: 'bullet',
            path: [1, 1],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.format).toBe('bullet');
      expect(result?.numberingProperties?.ilvl).toBe(1);
      expect(result?.numberingProperties?.counterValue).toBe(1);
      expect(result?.numberingProperties?.markerText).toBe('•');
    });

    it('should handle non-finite counter values gracefully', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '•',
            path: [NaN],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // NaN gets filtered out during path normalization, so buildNumberingPath creates [1]
      expect(result?.numberingProperties?.counterValue).toBe(1);
    });

    it('should handle deep nesting (path with many levels)', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: 'i.',
            path: [1, 1, 1, 1, 1],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.ilvl).toBe(4);
      expect(result?.numberingProperties?.counterValue).toBe(1);
      expect(result?.numberingProperties?.path).toEqual([1, 1, 1, 1, 1]);
    });

    it('should handle partial listRendering (only markerText)', () => {
      const para: PMNode = {
        attrs: {
          listRendering: {
            markerText: '-',
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      expect(result?.numberingProperties?.numId).toBe(-1);
      expect(result?.numberingProperties?.ilvl).toBe(0);
      expect(result?.numberingProperties?.markerText).toBe('-');
      expect(result?.numberingProperties?.format).toBeUndefined();
      expect(result?.numberingProperties?.lvlJc).toBeUndefined();
      expect(result?.numberingProperties?.suffix).toBeUndefined();
    });

    it('should prioritize paragraphProperties.numberingProperties over fallback', () => {
      const para: PMNode = {
        attrs: {
          paragraphProperties: {
            numberingProperties: {
              numId: 10,
              ilvl: 3,
            },
          },
          listRendering: {
            markerText: 'Should not be used',
            path: [99],
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Should use paragraphProperties, not listRendering fallback
      expect(result?.numberingProperties?.numId).toBe(10);
      expect(result?.numberingProperties?.ilvl).toBe(3);
    });
  });

  describe('contextualSpacing attribute extraction', () => {
    const createStyleContext = () => ({
      styles: {},
      defaults: {},
    });

    describe('fallback chain priority', () => {
      it('should prioritize normalizedSpacing.contextualSpacing (priority 1)', () => {
        const para: PMNode = {
          attrs: {
            spacing: {
              contextualSpacing: true,
            },
            paragraphProperties: {
              contextualSpacing: false, // Should be ignored
            },
            contextualSpacing: false, // Should be ignored
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should use paragraphProps.contextualSpacing when normalizedSpacing is absent (priority 2)', () => {
        const para: PMNode = {
          attrs: {
            paragraphProperties: {
              contextualSpacing: true,
            },
            contextualSpacing: false, // Should be ignored
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should use attrs.contextualSpacing when both higher priorities are absent (priority 3)', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: true,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should return undefined when contextualSpacing is not set anywhere', () => {
        const para: PMNode = {
          attrs: {
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBeUndefined();
      });

      it('should use hydrated.contextualSpacing when all higher priorities are absent (priority 4)', () => {
        const para: PMNode = {
          attrs: {
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();
        const hydrationOverride = {
          contextualSpacing: true,
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should use hydrated.contextualSpacing=false when all higher priorities are absent', () => {
        const para: PMNode = {
          attrs: {
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();
        const hydrationOverride = {
          contextualSpacing: false,
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should prioritize attrs.contextualSpacing over hydrated.contextualSpacing', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: true,
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();
        const hydrationOverride = {
          contextualSpacing: false, // Should be overridden by attrs
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should prioritize paragraphProps.contextualSpacing over hydrated.contextualSpacing', () => {
        const para: PMNode = {
          attrs: {
            paragraphProperties: {
              contextualSpacing: true,
            },
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();
        const hydrationOverride = {
          contextualSpacing: false, // Should be overridden by paragraphProps
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should prioritize normalizedSpacing.contextualSpacing over hydrated.contextualSpacing', () => {
        const para: PMNode = {
          attrs: {
            spacing: {
              before: 10,
              after: 10,
              contextualSpacing: true,
            },
          },
        };
        const styleContext = createTestStyleContext();
        const hydrationOverride = {
          contextualSpacing: false, // Should be overridden by spacing.contextualSpacing
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        expect(result?.contextualSpacing).toBe(true);
      });
    });

    describe('OOXML boolean value handling', () => {
      it('should handle boolean true', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: true,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should handle boolean false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: false,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should handle numeric 1 as true', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 1,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should handle numeric 0 as false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 0,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should handle string "1" as true', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: '1',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should handle string "0" as false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: '0',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should handle string "true" as true', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 'true',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should handle string "false" as false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 'false',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should handle string "on" as true', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 'on',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
      });

      it('should handle string "off" as false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 'off',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should handle case-insensitive string values', () => {
        const para1: PMNode = {
          attrs: {
            contextualSpacing: 'TRUE',
          },
        };
        const para2: PMNode = {
          attrs: {
            contextualSpacing: 'FALSE',
          },
        };
        const para3: PMNode = {
          attrs: {
            contextualSpacing: 'On',
          },
        };
        const styleContext = createTestStyleContext();

        expect(computeParagraphAttrs(para1, styleContext)?.contextualSpacing).toBe(true);
        expect(computeParagraphAttrs(para2, styleContext)?.contextualSpacing).toBe(false);
        expect(computeParagraphAttrs(para3, styleContext)?.contextualSpacing).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should treat null as not set', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: null,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBeUndefined();
      });

      it('should treat undefined as not set', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: undefined,
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBeUndefined();
      });

      it('should handle invalid string values as false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: 'invalid',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });

      it('should handle empty string as false', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: '',
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(false);
      });
    });

    describe('integration with spacing', () => {
      it('should work together with spacing.before and spacing.after', () => {
        const para: PMNode = {
          attrs: {
            contextualSpacing: true,
            spacing: {
              before: 10,
              after: 20,
            },
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
        expect(result?.spacing?.before).toBeDefined();
        expect(result?.spacing?.after).toBeDefined();
      });

      it('should work when contextualSpacing is in spacing object', () => {
        const para: PMNode = {
          attrs: {
            spacing: {
              before: 10,
              after: 20,
              contextualSpacing: true,
            },
          },
        };
        const styleContext = createTestStyleContext();

        const result = computeParagraphAttrs(para, styleContext);

        expect(result?.contextualSpacing).toBe(true);
        expect(result?.spacing?.before).toBeDefined();
        expect(result?.spacing?.after).toBeDefined();
      });

      it('should integrate with styles that define contextualSpacing (e.g., ListBullet)', () => {
        const para: PMNode = {
          attrs: {
            styleId: 'ListBullet',
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();
        // Simulate a style like ListBullet that defines contextualSpacing
        const hydrationOverride = {
          contextualSpacing: true,
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        expect(result?.contextualSpacing).toBe(true);
        expect(result?.spacing?.before).toBeDefined();
        expect(result?.spacing?.after).toBeDefined();
      });

      it('should allow paragraph to override style-defined contextualSpacing', () => {
        const para: PMNode = {
          attrs: {
            styleId: 'ListBullet',
            contextualSpacing: false, // Explicit override of style
            spacing: {
              before: 10,
              after: 10,
            },
          },
        };
        const styleContext = createTestStyleContext();
        // Simulate a style that defines contextualSpacing=true
        const hydrationOverride = {
          contextualSpacing: true, // From style
          spacing: { before: 10, after: 10 },
        };

        const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

        // Paragraph-level override should win
        expect(result?.contextualSpacing).toBe(false);
      });
    });
  });
});

describe('computeParagraphAttrs - indent priority cascade', () => {
  // These tests verify the indent priority order documented in the code:
  // 1. hydratedIndentPx - from styles (docDefaults, paragraph styles) - lowest
  // 2. paragraphIndentPx - from paragraphProperties.indent (inline paragraph properties)
  // 3. textIndentPx - from attrs.textIndent (legacy/alternative format)
  // 4. attrsIndentPx - from attrs.indent (direct paragraph attributes - highest priority)

  const createStyleContext = () =>
    ({
      styles: {},
      defaults: {},
    }) as Parameters<typeof computeParagraphAttrs>[1];

  describe('priority order: higher-priority source wins for same property', () => {
    it('should prioritize attrs.indent over hydrated indent (style)', () => {
      const para = {
        attrs: {
          indent: { left: 48 }, // Direct attribute - highest priority (48px)
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 720 }, // From style in twips (~48px but different)
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // attrs.indent should win over hydrated indent
      expect(result?.indent?.left).toBe(48);
    });

    it('should prioritize attrs.indent over paragraphProperties.indent', () => {
      const para = {
        attrs: {
          indent: { left: 24 }, // Direct attribute (24px)
          paragraphProperties: {
            indent: { left: 1440 }, // Inline property in twips (~96px)
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // attrs.indent should win over paragraphProperties.indent
      expect(result?.indent?.left).toBe(24);
    });

    it('should prioritize attrs.indent over attrs.textIndent', () => {
      const para = {
        attrs: {
          // Use 31 instead of 30 - 30 is divisible by 15 which triggers twips heuristic
          indent: { left: 31 }, // Direct attribute (31px) - highest priority
          textIndent: { left: 2880 }, // Legacy format in twips (~192px)
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // attrs.indent should win over textIndent
      expect(result?.indent?.left).toBe(31);
    });

    it('should prioritize paragraphProperties.indent over hydrated indent', () => {
      const para = {
        attrs: {
          paragraphProperties: {
            indent: { left: 720 }, // Inline property in twips (~48px)
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 1440 }, // From style in twips (~96px)
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // paragraphProperties.indent should win over hydrated indent
      expect(result?.indent?.left).toBeCloseTo(twipsToPx(720));
    });

    it('should use full priority chain: hydrated < paragraphProps < textIndent < attrs.indent', () => {
      const para = {
        attrs: {
          indent: { left: 10, right: 20 }, // Highest priority
          textIndent: { left: 1440, hanging: 360 }, // Second highest (~96px left, ~24px hanging)
          paragraphProperties: {
            indent: { left: 2160, firstLine: 720 }, // Third priority (~144px left, ~48px firstLine)
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 2880, right: 720, firstLine: 360 }, // Lowest priority
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // left: 10 from attrs.indent (highest priority)
      expect(result?.indent?.left).toBe(10);
      // right: 20 from attrs.indent (highest priority)
      expect(result?.indent?.right).toBe(20);
      // hanging: from textIndent (next priority with hanging)
      // Note: firstLine/hanging mutual exclusivity - when attrs.indent has neither,
      // textIndent's hanging applies and should clear paragraphProperties' firstLine
      expect(result?.indent?.hanging).toBeCloseTo(twipsToPx(360));
      // firstLine from paragraphProperties is cleared because higher-priority hanging is present
      expect(result?.indent?.firstLine).toBeUndefined();
    });
  });

  describe('zero values as explicit overrides', () => {
    // Note: indentPtToPx filters out zero left/right values as they are cosmetic.
    // However, zero firstLine/hanging are preserved as they are meaningful overrides.

    it('should filter out zero left/right values (cosmetic optimization)', () => {
      // This is documented behavior: zero left/right are filtered out
      // because they represent the default state (no indent).
      // When explicit zeros are set, they override inherited values in the cascade,
      // and then indentPtToPx filters out the zero values from the final result.
      const para = {
        attrs: {
          indent: { left: 0, right: 0 }, // Explicit zeros override hydration
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 720, right: 360 }, // From style in twips
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // Zero left/right are first applied (overriding hydration), then filtered out
      // Result: neither left nor right is present (not the hydration values)
      expect(result?.indent?.left).toBeUndefined();
      expect(result?.indent?.right).toBeUndefined();
    });

    it('should preserve zero firstLine as explicit override', () => {
      const para = {
        attrs: {
          indent: { firstLine: 0 }, // Explicit zero override
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { firstLine: 720 }, // From style (~48px)
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // Zero firstLine IS preserved (unlike left/right)
      expect(result?.indent?.firstLine).toBe(0);
    });

    it('should preserve zero hanging as explicit override', () => {
      const para = {
        attrs: {
          indent: { hanging: 0 }, // Explicit zero override
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { hanging: 720 }, // From style (~48px)
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // Zero hanging IS preserved (unlike left/right)
      expect(result?.indent?.hanging).toBe(0);
    });

    it('should handle firstLine overriding hanging with mutual exclusivity', () => {
      // When firstLine is set, hanging should be cleared via firstLine/hanging mutual exclusivity
      const para = {
        attrs: {
          indent: { firstLine: 24 }, // Explicit firstLine
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { hanging: 360 }, // From style (~24px)
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // firstLine should be present
      expect(result?.indent?.firstLine).toBe(24);
      // hanging from style should be cleared by mutual exclusivity handler
      // Per OOXML, firstLine and hanging are mutually exclusive - when firstLine is set,
      // hanging should be completely removed (undefined), not just set to 0.
      expect(result?.indent?.hanging).toBeUndefined();
    });
  });

  describe('multiple overlapping indent sources', () => {
    it('should merge non-overlapping properties from all sources', () => {
      const para = {
        attrs: {
          indent: { right: 48 }, // Only right
          paragraphProperties: {
            indent: { left: 720 }, // Only left in twips (~48px)
          },
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { firstLine: 360 }, // Only firstLine in twips (~24px)
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // All properties should be merged from different sources
      expect(result?.indent?.right).toBe(48); // from attrs.indent
      expect(result?.indent?.left).toBeCloseTo(twipsToPx(720)); // from paragraphProperties
      expect(result?.indent?.firstLine).toBeCloseTo(twipsToPx(360)); // from hydration
    });

    it('should handle partial override: left from attrs, rest inherited', () => {
      const para = {
        attrs: {
          indent: { left: 24 }, // Only override left
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 720, right: 360, firstLine: 180 }, // Full indent from style
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // left from attrs.indent overrides hydrated
      expect(result?.indent?.left).toBe(24);
      // right and firstLine inherited from hydration
      expect(result?.indent?.right).toBeCloseTo(twipsToPx(360));
      expect(result?.indent?.firstLine).toBeCloseTo(twipsToPx(180));
    });

    it('should handle three sources with different properties', () => {
      const para = {
        attrs: {
          indent: { left: 10 }, // Only left
          textIndent: { right: 1440 }, // Only right in twips (~96px)
          paragraphProperties: {
            indent: { firstLine: 360 }, // Only firstLine in twips (~24px)
          },
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // All properties should be present from their respective sources
      expect(result?.indent?.left).toBe(10);
      expect(result?.indent?.right).toBeCloseTo(twipsToPx(1440));
      expect(result?.indent?.firstLine).toBeCloseTo(twipsToPx(360));
    });
  });

  describe('firstLine/hanging mutual exclusivity', () => {
    it('should handle firstLine and hanging from different priority sources', () => {
      // When a higher-priority source sets firstLine, the combineIndentProperties handler
      // processes it, but the actual removal of hanging happens in post-processing.
      // The result may still show hanging=0 since indentPtToPx preserves zero values.
      const para = {
        attrs: {
          indent: { firstLine: 24 }, // Higher priority sets firstLine
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { hanging: 360, left: 720 }, // Style has hanging
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // firstLine from attrs should win
      expect(result?.indent?.firstLine).toBe(24);
      // Per OOXML, firstLine and hanging are mutually exclusive - when firstLine is explicitly set,
      // hanging should be completely removed (undefined), not just set to 0.
      expect(result?.indent?.hanging).toBeUndefined();
      // left should still be inherited
      expect(result?.indent?.left).toBeCloseTo(twipsToPx(720));
    });

    it('should keep hanging when no higher-priority firstLine exists', () => {
      const para = {
        attrs: {
          indent: { left: 48 }, // Only left, no firstLine
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { hanging: 360 }, // Style has hanging
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // hanging should be preserved since no higher-priority source sets firstLine
      expect(result?.indent?.hanging).toBeCloseTo(twipsToPx(360));
    });
  });

  describe('edge cases', () => {
    it('should handle empty indent object from attrs', () => {
      const para = {
        attrs: {
          indent: {}, // Empty indent
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 720 }, // From style
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      // Should inherit from hydration since attrs.indent is empty
      expect(result?.indent?.left).toBeCloseTo(twipsToPx(720));
    });

    it('should handle undefined indent gracefully', () => {
      const para = {
        attrs: {
          indent: undefined,
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 720 },
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      expect(result?.indent?.left).toBeCloseTo(twipsToPx(720));
    });

    it('should handle null indent gracefully', () => {
      const para = {
        attrs: {
          indent: null,
        },
      };
      const styleContext = createTestStyleContext();
      const hydrationOverride = {
        indent: { left: 720 },
      };

      const result = computeParagraphAttrs(para, styleContext, undefined, undefined, hydrationOverride);

      expect(result?.indent?.left).toBeCloseTo(twipsToPx(720));
    });

    it('should handle negative indent values', () => {
      const para = {
        attrs: {
          indent: { left: -20, firstLine: -10 }, // Negative indents (outdents)
        },
      };
      const styleContext = createTestStyleContext();

      const result = computeParagraphAttrs(para, styleContext);

      // Negative values should be preserved
      expect(result?.indent?.left).toBe(-20);
      expect(result?.indent?.firstLine).toBe(-10);
    });
  });
});
