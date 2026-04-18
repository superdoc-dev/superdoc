/**
 * Tests for layout-utils.ts
 * Tests empty paragraph detection and spacing suppression utilities.
 */

import { describe, it, expect } from 'bun:test';
import type { ParagraphBlock, TextRun, ImageRun } from '@superdoc/contracts';
import { isEmptyTextParagraph, shouldSuppressSpacingForEmpty, shouldSuppressOwnSpacing } from './layout-utils.js';

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
// Per-Paragraph Contextual Spacing Tests
// ============================================================================

describe('shouldSuppressOwnSpacing', () => {
  it('returns true when paragraph has contextualSpacing and adjacent has same styleId', () => {
    expect(shouldSuppressOwnSpacing('Normal', true, 'Normal')).toBe(true);
  });

  it('returns false when paragraph does not have contextualSpacing', () => {
    expect(shouldSuppressOwnSpacing('Normal', false, 'Normal')).toBe(false);
  });

  it('returns false when styles differ', () => {
    expect(shouldSuppressOwnSpacing('Heading1', true, 'Normal')).toBe(false);
  });

  it('returns false when own styleId is undefined', () => {
    expect(shouldSuppressOwnSpacing(undefined, true, 'Normal')).toBe(false);
  });

  it('returns false when adjacent styleId is undefined', () => {
    expect(shouldSuppressOwnSpacing('Normal', true, undefined)).toBe(false);
  });

  it('returns false when both styleIds are undefined', () => {
    expect(shouldSuppressOwnSpacing(undefined, true, undefined)).toBe(false);
  });

  it('does not consult the adjacent paragraph contextualSpacing flag', () => {
    // The adjacent paragraph's contextualSpacing is irrelevant — each paragraph
    // independently decides whether to suppress its own spacing.
    expect(shouldSuppressOwnSpacing('Normal', true, 'Normal')).toBe(true);
  });
});
