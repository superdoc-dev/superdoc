/**
 * Tests for layout-utils.ts
 * Tests empty paragraph detection and spacing suppression utilities.
 */

import { describe, it, expect } from 'vitest';
import type { ParagraphBlock, TextRun, ImageRun } from '@superdoc/contracts';
import {
  isEmptyTextParagraph,
  shouldSuppressSpacingForEmpty,
  shouldSuppressContextualSpacing,
} from './layout-utils.js';

// ============================================================================
// Empty Paragraph Detection Tests
// ============================================================================

describe('isEmptyTextParagraph', () => {
  it('returns true for paragraph with no runs', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [],
    };
    expect(isEmptyTextParagraph(block)).toBe(true);
  });

  it('returns true for paragraph with undefined runs', () => {
    const block = {
      kind: 'paragraph',
    } as ParagraphBlock;
    expect(isEmptyTextParagraph(block)).toBe(true);
  });

  it('returns true for paragraph with single empty text run', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun],
    };
    expect(isEmptyTextParagraph(block)).toBe(true);
  });

  it('returns true for paragraph with single empty text run with explicit kind', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ kind: 'text', text: '' } as TextRun],
    };
    expect(isEmptyTextParagraph(block)).toBe(true);
  });

  it('returns false for paragraph with text content', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: 'Hello' } as TextRun],
    };
    expect(isEmptyTextParagraph(block)).toBe(false);
  });

  it('returns false for paragraph with multiple runs', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun, { text: '' } as TextRun],
    };
    expect(isEmptyTextParagraph(block)).toBe(false);
  });

  it('returns false for paragraph with image run', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ kind: 'image', src: 'test.png' } as ImageRun],
    };
    expect(isEmptyTextParagraph(block)).toBe(false);
  });

  it('returns false for paragraph with tab run', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ kind: 'tab' }],
    };
    expect(isEmptyTextParagraph(block)).toBe(false);
  });
});

// ============================================================================
// Spacing Suppression Tests
// ============================================================================

describe('shouldSuppressSpacingForEmpty', () => {
  it('returns false for non-empty paragraph', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: 'Hello' } as TextRun],
      attrs: {
        spacingExplicit: { before: false, after: false },
      },
    };
    expect(shouldSuppressSpacingForEmpty(block, 'before')).toBe(false);
    expect(shouldSuppressSpacingForEmpty(block, 'after')).toBe(false);
  });

  it('returns false for empty paragraph without spacingExplicit', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun],
      attrs: {},
    };
    expect(shouldSuppressSpacingForEmpty(block, 'before')).toBe(false);
    expect(shouldSuppressSpacingForEmpty(block, 'after')).toBe(false);
  });

  it('returns true for empty paragraph with inherited before spacing', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun],
      attrs: {
        spacingExplicit: { before: false, after: true },
      },
    };
    expect(shouldSuppressSpacingForEmpty(block, 'before')).toBe(true);
    expect(shouldSuppressSpacingForEmpty(block, 'after')).toBe(false);
  });

  it('returns true for empty paragraph with inherited after spacing', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun],
      attrs: {
        spacingExplicit: { before: true, after: false },
      },
    };
    expect(shouldSuppressSpacingForEmpty(block, 'before')).toBe(false);
    expect(shouldSuppressSpacingForEmpty(block, 'after')).toBe(true);
  });

  it('returns false for empty paragraph with explicit spacing', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun],
      attrs: {
        spacingExplicit: { before: true, after: true },
      },
    };
    expect(shouldSuppressSpacingForEmpty(block, 'before')).toBe(false);
    expect(shouldSuppressSpacingForEmpty(block, 'after')).toBe(false);
  });

  it('returns true when spacingExplicit property is undefined (inherited)', () => {
    const block: ParagraphBlock = {
      kind: 'paragraph',
      runs: [{ text: '' } as TextRun],
      attrs: {
        spacingExplicit: {},
      },
    };
    expect(shouldSuppressSpacingForEmpty(block, 'before')).toBe(true);
    expect(shouldSuppressSpacingForEmpty(block, 'after')).toBe(true);
  });
});

// ============================================================================
// Bilateral Contextual Spacing Tests
// ============================================================================

describe('shouldSuppressContextualSpacing', () => {
  it('returns true when both sides have contextualSpacing and same styleId', () => {
    expect(shouldSuppressContextualSpacing('Normal', true, 'Normal', true)).toBe(true);
  });

  it('returns false when only the previous side has contextualSpacing', () => {
    expect(shouldSuppressContextualSpacing('Normal', true, 'Normal', false)).toBe(false);
  });

  it('returns false when only the next side has contextualSpacing', () => {
    expect(shouldSuppressContextualSpacing('Normal', false, 'Normal', true)).toBe(false);
  });

  it('returns false when neither side has contextualSpacing', () => {
    expect(shouldSuppressContextualSpacing('Normal', false, 'Normal', false)).toBe(false);
  });

  it('returns false when both have contextualSpacing but different styleIds', () => {
    expect(shouldSuppressContextualSpacing('Heading1', true, 'Normal', true)).toBe(false);
  });

  it('returns false when prevStyleId is undefined', () => {
    expect(shouldSuppressContextualSpacing(undefined, true, 'Normal', true)).toBe(false);
  });

  it('returns false when nextStyleId is undefined', () => {
    expect(shouldSuppressContextualSpacing('Normal', true, undefined, true)).toBe(false);
  });

  it('returns false when both styleIds are undefined', () => {
    expect(shouldSuppressContextualSpacing(undefined, true, undefined, true)).toBe(false);
  });
});
