import type { TextAddress } from '@superdoc/document-api';
import { normalizeMatchRanges } from './compiler.js';
import { PlanError } from './errors.js';

// ---------------------------------------------------------------------------
// Helper to build TextAddress values concisely
// ---------------------------------------------------------------------------

function addr(blockId: string, start: number, end: number): TextAddress {
  return { kind: 'text', blockId, range: { start, end } };
}

// ---------------------------------------------------------------------------
// normalizeMatchRanges — unit tests
// ---------------------------------------------------------------------------

describe('normalizeMatchRanges', () => {
  const stepId = 'step-1';

  // --- Single range (passthrough) ---

  it('returns a single range unchanged', () => {
    const result = normalizeMatchRanges(stepId, [addr('p1', 5, 10)]);
    expect(result).toEqual({ blockId: 'p1', from: 5, to: 10 });
  });

  // --- Contiguous multi-range coalescing ---

  it('coalesces two adjacent ranges in the same block', () => {
    const result = normalizeMatchRanges(stepId, [addr('p1', 0, 5), addr('p1', 5, 11)]);
    expect(result).toEqual({ blockId: 'p1', from: 0, to: 11 });
  });

  it('coalesces three contiguous ranges (split-run phrase)', () => {
    // Simulates "hello world!" split across bold, plain, italic runs
    const result = normalizeMatchRanges(stepId, [addr('p1', 0, 5), addr('p1', 5, 11), addr('p1', 11, 12)]);
    expect(result).toEqual({ blockId: 'p1', from: 0, to: 12 });
  });

  it('coalesces unsorted ranges by sorting first', () => {
    const result = normalizeMatchRanges(stepId, [addr('p1', 10, 15), addr('p1', 0, 5), addr('p1', 5, 10)]);
    expect(result).toEqual({ blockId: 'p1', from: 0, to: 15 });
  });

  it('handles overlapping sub-ranges within a single block', () => {
    // Edge case: ranges overlap slightly (shouldn't happen normally, but the
    // normalizer should handle it gracefully by extending)
    const result = normalizeMatchRanges(stepId, [addr('p1', 0, 7), addr('p1', 5, 12)]);
    expect(result).toEqual({ blockId: 'p1', from: 0, to: 12 });
  });

  // --- Cross-block → CROSS_BLOCK_MATCH ---

  it('throws CROSS_BLOCK_MATCH when ranges span multiple blocks', () => {
    expect(() => normalizeMatchRanges(stepId, [addr('p1', 0, 5), addr('p2', 0, 5)])).toThrow(PlanError);

    try {
      normalizeMatchRanges(stepId, [addr('p1', 0, 5), addr('p2', 0, 5)]);
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('CROSS_BLOCK_MATCH');
      expect((e as PlanError).stepId).toBe(stepId);
    }
  });

  it('throws CROSS_BLOCK_MATCH with all distinct blockIds in details', () => {
    try {
      normalizeMatchRanges(stepId, [addr('p1', 0, 3), addr('p2', 0, 3), addr('p3', 0, 3)]);
    } catch (e) {
      const details = (e as PlanError).details as { blockIds: string[] };
      expect(details.blockIds).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
      expect(details.blockIds).toHaveLength(3);
    }
  });

  // --- Discontiguous same-block → INVALID_INPUT ---

  it('throws INVALID_INPUT for discontiguous ranges in the same block', () => {
    expect(() => normalizeMatchRanges(stepId, [addr('p1', 0, 5), addr('p1', 10, 15)])).toThrow(PlanError);

    try {
      normalizeMatchRanges(stepId, [addr('p1', 0, 5), addr('p1', 10, 15)]);
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('INVALID_INPUT');
      expect((e as PlanError).message).toContain('discontiguous');
    }
  });

  // --- Empty ranges → INVALID_INPUT ---

  it('throws INVALID_INPUT for empty range array', () => {
    expect(() => normalizeMatchRanges(stepId, [])).toThrow(PlanError);

    try {
      normalizeMatchRanges(stepId, []);
    } catch (e) {
      expect((e as PlanError).code).toBe('INVALID_INPUT');
    }
  });

  // --- Malformed range bounds → INVALID_INPUT ---

  it('throws INVALID_INPUT for negative start offset', () => {
    try {
      normalizeMatchRanges(stepId, [addr('p1', -3, 5)]);
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('INVALID_INPUT');
      expect((e as PlanError).message).toContain('invalid range bounds');
      return;
    }
    throw new Error('expected PlanError');
  });

  it('throws INVALID_INPUT for inverted range (end < start)', () => {
    try {
      normalizeMatchRanges(stepId, [addr('p1', 10, 5)]);
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).code).toBe('INVALID_INPUT');
      expect((e as PlanError).message).toContain('invalid range bounds');
      return;
    }
    throw new Error('expected PlanError');
  });

  it('throws INVALID_INPUT when any range in a multi-range set has bad bounds', () => {
    try {
      normalizeMatchRanges(stepId, [
        addr('p1', 0, 5),
        addr('p1', 5, 3), // inverted
      ]);
    } catch (e) {
      expect((e as PlanError).code).toBe('INVALID_INPUT');
      return;
    }
    throw new Error('expected PlanError');
  });

  it('accepts zero-width range (start === end)', () => {
    const result = normalizeMatchRanges(stepId, [addr('p1', 5, 5)]);
    expect(result).toEqual({ blockId: 'p1', from: 5, to: 5 });
  });

  // --- Cardinality semantics ---

  it('produces one result per logical match regardless of range fragment count', () => {
    // This verifies the fundamental semantic: 3 fragments from one search hit = 1 target
    const result = normalizeMatchRanges(stepId, [addr('p1', 0, 4), addr('p1', 4, 8), addr('p1', 8, 12)]);
    // One object, not three
    expect(result).toEqual({ blockId: 'p1', from: 0, to: 12 });
  });
});

// ---------------------------------------------------------------------------
// TextRewriteStep type — style is optional
// ---------------------------------------------------------------------------

describe('TextRewriteStep type contract', () => {
  it('accepts text.rewrite step without style (compile-time + runtime check)', () => {
    // This verifies the type change: style is now optional on TextRewriteStep.
    // When omitted, the executor defaults to preserve mode.
    const step: import('@superdoc/document-api').TextRewriteStep = {
      id: 'rewrite-1',
      op: 'text.rewrite',
      where: {
        by: 'select',
        select: { type: 'text', pattern: 'hello' },
        require: 'exactlyOne',
      },
      args: {
        replacement: { text: 'world' },
        // style intentionally omitted — should compile and be valid
      },
    };

    expect(step.args.style).toBeUndefined();
    expect(step.op).toBe('text.rewrite');
  });

  it('still accepts text.rewrite step with explicit style', () => {
    const step: import('@superdoc/document-api').TextRewriteStep = {
      id: 'rewrite-2',
      op: 'text.rewrite',
      where: {
        by: 'select',
        select: { type: 'text', pattern: 'hello' },
        require: 'exactlyOne',
      },
      args: {
        replacement: { text: 'world' },
        style: {
          inline: { mode: 'preserve', onNonUniform: 'majority' },
          paragraph: { mode: 'preserve' },
        },
      },
    };

    expect(step.args.style).toBeDefined();
    expect(step.args.style!.inline.mode).toBe('preserve');
  });
});
