/**
 * Tests for Spacing & Indent Normalization Module
 *
 * Covers:
 * - normalizeAlignment
 * - normalizeParagraphSpacing
 * - normalizeLineRule
 * - indent conversion via computeParagraphAttrs (twips -> px)
 */

import { describe, it, expect } from 'vitest';
import type { ParagraphIndent, ParagraphSpacing } from '@superdoc/contracts';
import { normalizeAlignment, normalizeParagraphSpacing, normalizeLineRule } from './spacing-indent.js';
import { computeParagraphAttrs } from './paragraph.js';
import { twipsToPx } from '../utilities.js';

const getIndent = (indent: ParagraphIndent | null | undefined) => {
  const para = {
    type: 'paragraph',
    attrs: {
      paragraphProperties: {
        indent,
      },
    },
  } as never;
  const { paragraphAttrs } = computeParagraphAttrs(para);
  return paragraphAttrs.indent;
};

describe('normalizeParagraphSpacing', () => {
  it('converts before/after from twips to px', () => {
    const spacing = { before: 240, after: 360 } as ParagraphSpacing; // 16px, 24px
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.before).toBe(twipsToPx(240));
    expect(result?.after).toBe(twipsToPx(360));
  });

  it('converts line from twips to pixels when lineRule is exact', () => {
    const spacing = { line: 360, lineRule: 'exact' as const } as ParagraphSpacing; // 24px
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.line).toBeCloseTo(24);
    expect(result?.lineRule).toBe('exact');
  });

  it('converts auto line values > 10 from 240ths of a line', () => {
    const spacing = { line: 360, lineRule: 'auto' as const } as ParagraphSpacing; // 1.5x
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.line).toBeCloseTo(1.725, 5);
    expect(result?.lineRule).toBe('auto');
  });

  it('preserves contextual spacing flags', () => {
    const spacing = { before: 240, beforeAutospacing: true, afterAutospacing: false } as ParagraphSpacing;
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.before).toBeCloseTo(twipsToPx(276), 5);
    expect(result?.beforeAutospacing).toBe(true);
    expect(result?.afterAutospacing).toBe(false);
  });

  it('uses default line value for auto spacing when line is missing', () => {
    const spacing = { beforeAutospacing: true, afterAutospacing: true } as ParagraphSpacing;
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.before).toBeCloseTo(twipsToPx(276), 5);
    expect(result?.after).toBeCloseTo(twipsToPx(276), 5);
  });

  it('drops auto spacing values for lists', () => {
    const spacing = { beforeAutospacing: true, afterAutospacing: true, line: 360 } as ParagraphSpacing;
    const result = normalizeParagraphSpacing(spacing, true);
    expect(result?.before).toBeUndefined();
    expect(result?.after).toBeUndefined();
    expect(result?.beforeAutospacing).toBe(true);
    expect(result?.afterAutospacing).toBe(true);
  });

  it('converts line to multiplier when lineRule is missing', () => {
    const spacing = { line: 360 } as ParagraphSpacing;
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.line).toBe(1.5);
    expect(result?.lineRule).toBeUndefined();
  });

  it('returns undefined for empty or invalid inputs', () => {
    expect(normalizeParagraphSpacing(undefined, false)).toBeUndefined();
    expect(normalizeParagraphSpacing(null as never, false)).toBeUndefined();
    expect(normalizeParagraphSpacing({} as ParagraphSpacing, false)).toEqual({ line: 1.15, lineUnit: 'multiplier' });
  });

  it('skips non-numeric values but preserves valid ones', () => {
    const spacing = { before: 'not-a-number', after: 300 } as unknown as ParagraphSpacing;
    const result = normalizeParagraphSpacing(spacing, false);
    expect(result?.before).toBeUndefined();
    expect(result?.after).toBe(twipsToPx(300));
  });
});

describe('normalizeAlignment', () => {
  it('normalizes alignment values', () => {
    expect(normalizeAlignment('left')).toBe('left');
    expect(normalizeAlignment('right')).toBe('right');
    expect(normalizeAlignment('center')).toBe('center');
    expect(normalizeAlignment('justify')).toBe('justify');
  });

  it('maps start/end to left/right', () => {
    expect(normalizeAlignment('start')).toBe('left');
    expect(normalizeAlignment('end')).toBe('right');
  });

  it('returns undefined for invalid values', () => {
    expect(normalizeAlignment('unknown')).toBeUndefined();
    expect(normalizeAlignment(123)).toBeUndefined();
  });
});

describe('normalizeLineRule', () => {
  it('returns valid line rules', () => {
    expect(normalizeLineRule('auto')).toBe('auto');
    expect(normalizeLineRule('exact')).toBe('exact');
    expect(normalizeLineRule('atLeast')).toBe('atLeast');
  });

  it('returns undefined for invalid values', () => {
    expect(normalizeLineRule('unknown')).toBeUndefined();
    expect(normalizeLineRule(null)).toBeUndefined();
  });
});

describe('indent conversion via computeParagraphAttrs', () => {
  it('converts left/right indents from twips to px', () => {
    const result = getIndent({ left: 720, right: 1440 });
    expect(result?.left).toBe(twipsToPx(720));
    expect(result?.right).toBe(twipsToPx(1440));
  });

  it('converts firstLine and hanging indents from twips to px', () => {
    const result = getIndent({ firstLine: 360, hanging: 180 });
    expect(result?.firstLine).toBe(twipsToPx(360));
    expect(result?.hanging).toBe(twipsToPx(180));
  });

  it('preserves zero and negative values via conversion', () => {
    const result = getIndent({ left: 0, firstLine: -720 });
    expect(result?.left).toBe(0);
    expect(result?.firstLine).toBe(twipsToPx(-720));
  });

  it('accepts numeric strings', () => {
    const result = getIndent({ left: '720' as never, right: '360' as never });
    expect(result?.left).toBe(twipsToPx(720));
    expect(result?.right).toBe(twipsToPx(360));
  });

  it('returns undefined for empty or invalid inputs', () => {
    expect(getIndent(undefined)).toBeUndefined();
    expect(getIndent(null)).toBeUndefined();
    expect(getIndent({})).toBeUndefined();
  });

  it('skips non-numeric values but preserves valid ones', () => {
    const result = getIndent({ left: 720, right: 'nope' as never });
    expect(result?.left).toBe(twipsToPx(720));
    expect(result?.right).toBeUndefined();
  });
});
