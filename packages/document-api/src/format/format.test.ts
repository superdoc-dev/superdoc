import { describe, expect, it, vi } from 'vitest';
import type { FormatAdapter, StyleApplyInput } from './format.js';
import { executeStyleApply } from './format.js';
import { DocumentApiValidationError } from '../errors.js';
import type { TextMutationReceipt } from '../types/index.js';

const TARGET = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 5 } };

function makeReceipt(): TextMutationReceipt {
  return {
    success: true,
    resolution: {
      blockId: 'p1',
      blockType: 'paragraph',
      text: 'Hello',
      target: TARGET,
      range: { start: 0, end: 5 },
    },
  };
}

function makeAdapter(): FormatAdapter & { apply: ReturnType<typeof vi.fn> } {
  return { apply: vi.fn(() => makeReceipt()) };
}

describe('executeStyleApply validation', () => {
  // -------------------------------------------------------------------------
  // Input shape guards
  // -------------------------------------------------------------------------

  it('rejects non-object input', () => {
    const adapter = makeAdapter();
    expect(() => executeStyleApply(adapter, null as any)).toThrow(DocumentApiValidationError);
    expect(() => executeStyleApply(adapter, 42 as any)).toThrow('non-null object');
    expect(() => executeStyleApply(adapter, 'bad' as any)).toThrow('non-null object');
  });

  // -------------------------------------------------------------------------
  // Unknown field rejection
  // -------------------------------------------------------------------------

  it('rejects unknown top-level fields', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: { bold: true }, extra: 1 };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('extra');
  });

  // -------------------------------------------------------------------------
  // Target validation
  // -------------------------------------------------------------------------

  it('rejects missing target', () => {
    const adapter = makeAdapter();
    const input = { marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires a target');
  });

  it('rejects invalid target (string)', () => {
    const adapter = makeAdapter();
    const input = { target: 'not-an-address', marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects invalid target (number)', () => {
    const adapter = makeAdapter();
    const input = { target: 42, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects invalid target (null)', () => {
    const adapter = makeAdapter();
    const input = { target: null, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target missing kind', () => {
    const adapter = makeAdapter();
    const input = { target: { blockId: 'p1', range: { start: 0, end: 5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with wrong kind', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'block', blockId: 'p1', range: { start: 0, end: 5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target missing blockId', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', range: { start: 0, end: 5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-string blockId', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 123, range: { start: 0, end: 5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target missing range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1' }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-object range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: 'bad' }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-integer start in range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: { start: 1.5, end: 5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-integer end in range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5.5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with start > end in range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: { start: 10, end: 5 } }, marks: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('accepts valid target', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { bold: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
  });

  it('accepts zero-length range (start === end) in target', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
      marks: { bold: true },
    };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Marks validation
  // -------------------------------------------------------------------------

  it('rejects missing marks', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires a marks object');
  });

  it('rejects null marks', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: null };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires a marks object');
  });

  it('rejects non-object marks', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: 'bold' };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('non-null object');
  });

  it('rejects empty marks object', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: {} };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('at least one known key');
  });

  it('rejects unknown mark keys', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: { bold: true, superscript: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('Unknown mark key "superscript"');
  });

  it('rejects non-boolean mark values', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: { bold: 'yes' } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('must be a boolean');
  });

  it('rejects numeric mark values', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, marks: { bold: 1 } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('must be a boolean');
  });

  // -------------------------------------------------------------------------
  // Happy paths — single mark
  // -------------------------------------------------------------------------

  it('delegates single mark to adapter.apply', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { bold: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
  });

  it('passes through tracked changeMode option', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { italic: false } };
    executeStyleApply(adapter, input, { changeMode: 'tracked' });
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'tracked', dryRun: false });
  });

  it('passes through dryRun option', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { underline: true } };
    executeStyleApply(adapter, input, { dryRun: true });
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
  });

  // -------------------------------------------------------------------------
  // Happy paths — multi-mark (boolean patch semantics)
  // -------------------------------------------------------------------------

  it('accepts multiple marks in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { bold: true, italic: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });

  it('accepts mixed set/unset in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { bold: true, italic: false } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });

  it('accepts all four marks in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = {
      target: TARGET,
      marks: { bold: true, italic: false, underline: true, strike: false },
    };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });

  it('accepts mark removal (false)', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, marks: { bold: false } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });
});
