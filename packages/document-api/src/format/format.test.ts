import { describe, expect, it, vi } from 'vitest';
import type { FormatAdapter, StyleApplyInput } from './format.js';
import { executeStyleApply, executeFontSize, executeFontFamily, executeColor, executeAlign } from './format.js';
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

function makeAdapter(): FormatAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    apply: vi.fn(() => makeReceipt()),
    fontSize: vi.fn(() => makeReceipt()),
    fontFamily: vi.fn(() => makeReceipt()),
    color: vi.fn(() => makeReceipt()),
    align: vi.fn(() => makeReceipt()),
  };
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
    const input = { target: TARGET, inline: { bold: true }, extra: 1 };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('extra');
  });

  // -------------------------------------------------------------------------
  // Target validation
  // -------------------------------------------------------------------------

  it('rejects missing target', () => {
    const adapter = makeAdapter();
    const input = { inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires a target');
  });

  it('rejects invalid target (string)', () => {
    const adapter = makeAdapter();
    const input = { target: 'not-an-address', inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects invalid target (number)', () => {
    const adapter = makeAdapter();
    const input = { target: 42, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects invalid target (null)', () => {
    const adapter = makeAdapter();
    const input = { target: null, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target missing kind', () => {
    const adapter = makeAdapter();
    const input = { target: { blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with wrong kind', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'block', blockId: 'p1', range: { start: 0, end: 5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target missing blockId', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', range: { start: 0, end: 5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-string blockId', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 123, range: { start: 0, end: 5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target missing range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1' }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-object range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: 'bad' }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-integer start in range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: { start: 1.5, end: 5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with non-integer end in range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5.5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('rejects target with start > end in range', () => {
    const adapter = makeAdapter();
    const input = { target: { kind: 'text', blockId: 'p1', range: { start: 10, end: 5 } }, inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('accepts valid target', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
  });

  it('accepts zero-length range (start === end) in target', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
      inline: { bold: true },
    };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Inline-style validation
  // -------------------------------------------------------------------------

  it('rejects missing inline', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires an inline object');
  });

  it('rejects null inline', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: null };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires an inline object');
  });

  it('rejects non-object inline', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: 'bold' };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('non-null object');
  });

  it('rejects empty inline object', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: {} };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('at least one known key');
  });

  it('rejects unknown inline keys', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: { bold: true, superscript: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('Unknown inline style key "superscript"');
  });

  it('rejects non-boolean inline values', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: { bold: 'yes' } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('must be a boolean');
  });

  it('rejects numeric inline values', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: { bold: 1 } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('must be a boolean');
  });

  // -------------------------------------------------------------------------
  // Happy paths — single inline style
  // -------------------------------------------------------------------------

  it('delegates single mark to adapter.apply', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: false });
  });

  it('passes through tracked changeMode option', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { italic: false } };
    executeStyleApply(adapter, input, { changeMode: 'tracked' });
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'tracked', dryRun: false });
  });

  it('passes through dryRun option', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { underline: true } };
    executeStyleApply(adapter, input, { dryRun: true });
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'direct', dryRun: true });
  });

  // -------------------------------------------------------------------------
  // Happy paths — multi-mark (boolean patch semantics)
  // -------------------------------------------------------------------------

  it('accepts multiple inline in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: true, italic: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });

  it('accepts mixed set/unset in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: true, italic: false } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });

  it('accepts all four inline in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = {
      target: TARGET,
      inline: { bold: true, italic: false, underline: true, strike: false },
    };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });

  it('accepts mark removal (false)', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: false } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({}));
  });
});

// ---------------------------------------------------------------------------
// Shared target validation helper for value-based format operations
// ---------------------------------------------------------------------------

function targetValidationSuite(
  name: string,
  exec: (adapter: ReturnType<typeof makeAdapter>, input: unknown, options?: unknown) => unknown,
) {
  describe(`${name} target validation`, () => {
    it('rejects non-object input', () => {
      expect(() => exec(makeAdapter(), null)).toThrow(DocumentApiValidationError);
    });

    it('rejects missing target', () => {
      expect(() => exec(makeAdapter(), { value: '12pt' })).toThrow('requires a target');
    });

    it('rejects invalid target', () => {
      expect(() => exec(makeAdapter(), { target: 'bad', value: '12pt' })).toThrow('text address');
    });
  });
}

// ---------------------------------------------------------------------------
// executeFontSize validation
// ---------------------------------------------------------------------------

describe('executeFontSize validation', () => {
  targetValidationSuite('format.fontSize', (a, i) => executeFontSize(a, i as any));

  it('rejects missing value', () => {
    expect(() => executeFontSize(makeAdapter(), { target: TARGET } as any)).toThrow('requires a value');
  });

  it('rejects empty string value', () => {
    expect(() => executeFontSize(makeAdapter(), { target: TARGET, value: '' })).toThrow('empty string');
  });

  it('rejects boolean value', () => {
    expect(() => executeFontSize(makeAdapter(), { target: TARGET, value: true } as any)).toThrow(
      'string, number, or null',
    );
  });

  it('rejects unknown fields', () => {
    expect(() => executeFontSize(makeAdapter(), { target: TARGET, value: 12, extra: 1 } as any)).toThrow('extra');
  });

  it('accepts null value (unset)', () => {
    const adapter = makeAdapter();
    executeFontSize(adapter, { target: TARGET, value: null });
    expect(adapter.fontSize).toHaveBeenCalled();
  });

  it('accepts string value', () => {
    const adapter = makeAdapter();
    executeFontSize(adapter, { target: TARGET, value: '14pt' });
    expect(adapter.fontSize).toHaveBeenCalledWith({ target: TARGET, value: '14pt' }, expect.any(Object));
  });

  it('accepts numeric value', () => {
    const adapter = makeAdapter();
    executeFontSize(adapter, { target: TARGET, value: 16 });
    expect(adapter.fontSize).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// executeFontFamily validation
// ---------------------------------------------------------------------------

describe('executeFontFamily validation', () => {
  targetValidationSuite('format.fontFamily', (a, i) => executeFontFamily(a, i as any));

  it('rejects missing value', () => {
    expect(() => executeFontFamily(makeAdapter(), { target: TARGET } as any)).toThrow('requires a value');
  });

  it('rejects empty string value', () => {
    expect(() => executeFontFamily(makeAdapter(), { target: TARGET, value: '' })).toThrow('empty string');
  });

  it('rejects non-string value', () => {
    expect(() => executeFontFamily(makeAdapter(), { target: TARGET, value: 42 } as any)).toThrow('string or null');
  });

  it('accepts null value (unset)', () => {
    const adapter = makeAdapter();
    executeFontFamily(adapter, { target: TARGET, value: null });
    expect(adapter.fontFamily).toHaveBeenCalled();
  });

  it('accepts valid string value', () => {
    const adapter = makeAdapter();
    executeFontFamily(adapter, { target: TARGET, value: 'Arial' });
    expect(adapter.fontFamily).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// executeColor validation
// ---------------------------------------------------------------------------

describe('executeColor validation', () => {
  targetValidationSuite('format.color', (a, i) => executeColor(a, i as any));

  it('rejects missing value', () => {
    expect(() => executeColor(makeAdapter(), { target: TARGET } as any)).toThrow('requires a value');
  });

  it('rejects empty string value', () => {
    expect(() => executeColor(makeAdapter(), { target: TARGET, value: '' })).toThrow('empty string');
  });

  it('rejects non-string value', () => {
    expect(() => executeColor(makeAdapter(), { target: TARGET, value: 123 } as any)).toThrow('string or null');
  });

  it('accepts null value (unset)', () => {
    const adapter = makeAdapter();
    executeColor(adapter, { target: TARGET, value: null });
    expect(adapter.color).toHaveBeenCalled();
  });

  it('accepts hex color string', () => {
    const adapter = makeAdapter();
    executeColor(adapter, { target: TARGET, value: '#ff0000' });
    expect(adapter.color).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// executeAlign validation
// ---------------------------------------------------------------------------

describe('executeAlign validation', () => {
  targetValidationSuite('format.align', (a, i) => executeAlign(a, i as any));

  it('rejects missing alignment', () => {
    expect(() => executeAlign(makeAdapter(), { target: TARGET } as any)).toThrow('requires an alignment');
  });

  it('rejects invalid alignment value', () => {
    expect(() => executeAlign(makeAdapter(), { target: TARGET, alignment: 'middle' } as any)).toThrow(
      'left, center, right, justify',
    );
  });

  it('rejects empty string alignment', () => {
    expect(() => executeAlign(makeAdapter(), { target: TARGET, alignment: '' } as any)).toThrow(
      'left, center, right, justify',
    );
  });

  it('rejects unknown fields', () => {
    expect(() => executeAlign(makeAdapter(), { target: TARGET, alignment: 'left', extra: 1 } as any)).toThrow('extra');
  });

  it('accepts null alignment (unset)', () => {
    const adapter = makeAdapter();
    executeAlign(adapter, { target: TARGET, alignment: null });
    expect(adapter.align).toHaveBeenCalled();
  });

  it.each(['left', 'center', 'right', 'justify'] as const)('accepts alignment "%s"', (alignment) => {
    const adapter = makeAdapter();
    executeAlign(adapter, { target: TARGET, alignment });
    expect(adapter.align).toHaveBeenCalled();
  });
});
