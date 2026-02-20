import { describe, expect, it } from 'vitest';
import {
  SPACE_CHARS,
  shouldApplyJustify,
  calculateJustifySpacing,
  type ShouldApplyJustifyParams,
  type CalculateJustifySpacingParams,
} from './justify-utils.js';

describe('SPACE_CHARS', () => {
  it('contains regular space character', () => {
    expect(SPACE_CHARS.has(' ')).toBe(true);
  });

  it('contains non-breaking space character', () => {
    expect(SPACE_CHARS.has('\u00A0')).toBe(true);
  });

  it('has exactly two space characters', () => {
    expect(SPACE_CHARS.size).toBe(2);
  });
});

describe('shouldApplyJustify', () => {
  it('returns true for standard justified line', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(true);
  });

  it('returns false when alignment is not justify or both', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'left',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns false when alignment is center', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'center',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns false when alignment is right', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'right',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns false when alignment is undefined', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: undefined,
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns true when alignment is "both" (OOXML format)', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'both',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(true);
  });

  it('returns false for last line without soft break', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: true,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns true for last line with soft break (Shift+Enter)', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: true,
      paragraphEndsWithLineBreak: true,
    };
    expect(shouldApplyJustify(params)).toBe(true);
  });

  it('returns false when hasExplicitPositioning is true (tab stops)', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: true,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns false when skipJustifyOverride is true', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
      skipJustifyOverride: true,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });

  it('returns true when skipJustifyOverride is false', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
      skipJustifyOverride: false,
    };
    expect(shouldApplyJustify(params)).toBe(true);
  });

  it('returns true when skipJustifyOverride is undefined (not provided)', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: false,
      isLastLineOfParagraph: false,
      paragraphEndsWithLineBreak: false,
    };
    expect(shouldApplyJustify(params)).toBe(true);
  });

  it('returns false when multiple blocking conditions are met', () => {
    const params: ShouldApplyJustifyParams = {
      alignment: 'justify',
      hasExplicitPositioning: true,
      isLastLineOfParagraph: true,
      paragraphEndsWithLineBreak: false,
      skipJustifyOverride: true,
    };
    expect(shouldApplyJustify(params)).toBe(false);
  });
});

describe('calculateJustifySpacing', () => {
  it('returns 0 when shouldJustify is false', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 400,
      availableWidth: 500,
      spaceCount: 5,
      shouldJustify: false,
    };
    expect(calculateJustifySpacing(params)).toBe(0);
  });

  it('returns 0 when spaceCount is 0', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 400,
      availableWidth: 500,
      spaceCount: 0,
      shouldJustify: true,
    };
    expect(calculateJustifySpacing(params)).toBe(0);
  });

  it('returns 0 when spaceCount is negative', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 400,
      availableWidth: 500,
      spaceCount: -1,
      shouldJustify: true,
    };
    expect(calculateJustifySpacing(params)).toBe(0);
  });

  it('calculates positive spacing for line expansion', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 400,
      availableWidth: 500,
      spaceCount: 5,
      shouldJustify: true,
    };
    // slack = 500 - 400 = 100
    // spacing = 100 / 5 = 20
    expect(calculateJustifySpacing(params)).toBe(20);
  });

  it('calculates negative spacing for line compression', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 510,
      availableWidth: 500,
      spaceCount: 5,
      shouldJustify: true,
    };
    // slack = 500 - 510 = -10
    // spacing = -10 / 5 = -2
    expect(calculateJustifySpacing(params)).toBe(-2);
  });

  it('handles single space correctly', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 450,
      availableWidth: 500,
      spaceCount: 1,
      shouldJustify: true,
    };
    // slack = 500 - 450 = 50
    // spacing = 50 / 1 = 50
    expect(calculateJustifySpacing(params)).toBe(50);
  });

  it('handles zero slack correctly (line already fits perfectly)', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 500,
      availableWidth: 500,
      spaceCount: 5,
      shouldJustify: true,
    };
    // slack = 500 - 500 = 0
    // spacing = 0 / 5 = 0
    expect(calculateJustifySpacing(params)).toBe(0);
  });

  it('handles fractional results correctly', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 400,
      availableWidth: 500,
      spaceCount: 7,
      shouldJustify: true,
    };
    // slack = 500 - 400 = 100
    // spacing = 100 / 7 = 14.285714...
    expect(calculateJustifySpacing(params)).toBeCloseTo(14.285714, 5);
  });

  it('handles large spacing values', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 100,
      availableWidth: 500,
      spaceCount: 2,
      shouldJustify: true,
    };
    // slack = 500 - 100 = 400
    // spacing = 400 / 2 = 200
    expect(calculateJustifySpacing(params)).toBe(200);
  });

  it('handles small spacing values', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 498,
      availableWidth: 500,
      spaceCount: 10,
      shouldJustify: true,
    };
    // slack = 500 - 498 = 2
    // spacing = 2 / 10 = 0.2
    expect(calculateJustifySpacing(params)).toBe(0.2);
  });

  it('handles many spaces with small slack', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 495,
      availableWidth: 500,
      spaceCount: 25,
      shouldJustify: true,
    };
    // slack = 500 - 495 = 5
    // spacing = 5 / 25 = 0.2
    expect(calculateJustifySpacing(params)).toBe(0.2);
  });

  it('calculates spacing correctly with realistic values', () => {
    // Realistic example: 468px available (8.5" - 1" margins at 72dpi)
    // Line is 450px wide with 8 spaces
    const params: CalculateJustifySpacingParams = {
      lineWidth: 450,
      availableWidth: 468,
      spaceCount: 8,
      shouldJustify: true,
    };
    // slack = 468 - 450 = 18
    // spacing = 18 / 8 = 2.25
    expect(calculateJustifySpacing(params)).toBe(2.25);
  });

  it('returns 0 when both shouldJustify is false and spaceCount is 0', () => {
    const params: CalculateJustifySpacingParams = {
      lineWidth: 400,
      availableWidth: 500,
      spaceCount: 0,
      shouldJustify: false,
    };
    expect(calculateJustifySpacing(params)).toBe(0);
  });
});
