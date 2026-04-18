import { describe, expect, it } from 'vitest';
import { normalizeReplacementText } from './replacement-normalizer.js';
import { PlanError } from './errors.js';

// ---------------------------------------------------------------------------
// normalizeReplacementText — unit tests
// ---------------------------------------------------------------------------

describe('normalizeReplacementText', () => {
  const stepId = 'step-1';

  // --- Single paragraph ---

  it('returns single-element array for text with no double newlines', () => {
    const result = normalizeReplacementText('Hello world', stepId);
    expect(result).toEqual(['Hello world']);
  });

  // --- Two paragraphs ---

  it('splits on \\n\\n into two paragraphs', () => {
    const result = normalizeReplacementText('para1\n\npara2', stepId);
    expect(result).toEqual(['para1', 'para2']);
  });

  // --- Three paragraphs ---

  it('splits into three chunks when separated by \\n\\n', () => {
    const result = normalizeReplacementText('one\n\ntwo\n\nthree', stepId);
    expect(result).toEqual(['one', 'two', 'three']);
  });

  // --- Triple+ newlines treated as one boundary ---

  it('treats \\n\\n\\n as a single paragraph boundary (no empty paragraphs)', () => {
    const result = normalizeReplacementText('alpha\n\n\nbeta', stepId);
    expect(result).toEqual(['alpha', 'beta']);
  });

  it('treats many consecutive newlines as a single boundary', () => {
    const result = normalizeReplacementText('first\n\n\n\n\nsecond', stepId);
    expect(result).toEqual(['first', 'second']);
  });

  // --- Leading/trailing double newlines trimmed ---

  it('trims leading \\n\\n (no empty blocks at start)', () => {
    const result = normalizeReplacementText('\n\ntext', stepId);
    expect(result).toEqual(['text']);
  });

  it('trims trailing \\n\\n (no empty blocks at end)', () => {
    const result = normalizeReplacementText('text\n\n', stepId);
    expect(result).toEqual(['text']);
  });

  it('trims both leading and trailing \\n\\n', () => {
    const result = normalizeReplacementText('\n\ntext\n\n', stepId);
    expect(result).toEqual(['text']);
  });

  // --- \\r\\n normalized to \\n ---

  it('normalizes \\r\\n to \\n before splitting', () => {
    const result = normalizeReplacementText('para1\r\n\r\npara2', stepId);
    expect(result).toEqual(['para1', 'para2']);
  });

  // --- \\r normalized to \\n ---

  it('normalizes bare \\r to \\n before splitting', () => {
    const result = normalizeReplacementText('para1\r\rpara2', stepId);
    expect(result).toEqual(['para1', 'para2']);
  });

  // --- Single \\n preserved within paragraph ---

  it('preserves single \\n within a paragraph (not a boundary)', () => {
    const result = normalizeReplacementText('line1\nline2', stepId);
    expect(result).toEqual(['line1\nline2']);
  });

  it('preserves single \\n even adjacent to paragraph breaks', () => {
    const result = normalizeReplacementText('a\nb\n\nc\nd', stepId);
    expect(result).toEqual(['a\nb', 'c\nd']);
  });

  // --- Empty string throws ---

  it('throws INVALID_INPUT for empty string', () => {
    expect(() => normalizeReplacementText('', stepId)).toThrow(PlanError);

    try {
      normalizeReplacementText('', stepId);
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('INVALID_INPUT');
      expect((e as PlanError).stepId).toBe(stepId);
    }
  });

  // --- Only whitespace newlines throws ---

  it('throws INVALID_INPUT when input is only \\n\\n (normalizes to zero blocks)', () => {
    expect(() => normalizeReplacementText('\n\n', stepId)).toThrow(PlanError);

    try {
      normalizeReplacementText('\n\n', stepId);
    } catch (e) {
      expect((e as PlanError).code).toBe('INVALID_INPUT');
    }
  });

  it('throws INVALID_INPUT when input is only \\n\\n\\n\\n', () => {
    expect(() => normalizeReplacementText('\n\n\n\n', stepId)).toThrow(PlanError);

    try {
      normalizeReplacementText('\n\n\n\n', stepId);
    } catch (e) {
      expect((e as PlanError).code).toBe('INVALID_INPUT');
    }
  });

  // --- Mixed \\r\\n and \\n\\n ---

  it('handles mixed \\r\\n and \\n correctly', () => {
    const result = normalizeReplacementText('a\r\n\r\nb\n\nc', stepId);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('handles \\r\\n followed by \\n producing a paragraph break', () => {
    // \r\n\n → after normalization becomes \n\n → paragraph break
    const result = normalizeReplacementText('first\r\n\nsecond', stepId);
    expect(result).toEqual(['first', 'second']);
  });
});
