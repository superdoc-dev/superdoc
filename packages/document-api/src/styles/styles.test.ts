import { describe, it, expect, vi } from 'vitest';
import {
  executeStylesApply,
  type StylesAdapter,
  type StylesApplyInput,
  type StylesApplyOptions,
  type StylesApplyReceipt,
} from './styles.js';
import { DocumentApiValidationError } from '../errors.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAdapter(receipt?: Partial<StylesApplyReceipt>): StylesAdapter {
  return {
    apply: vi.fn(
      (): StylesApplyReceipt => ({
        success: true,
        changed: true,
        resolution: {
          scope: 'docDefaults',
          channel: 'run',
          xmlPart: 'word/styles.xml',
          xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
        },
        dryRun: false,
        before: { bold: 'inherit' },
        after: { bold: 'on' },
        ...receipt,
      }),
    ),
  };
}

const VALID_INPUT: StylesApplyInput = {
  target: { scope: 'docDefaults', channel: 'run' },
  patch: { bold: true },
};

function expectValidationError(fn: () => void, code: string, messagePattern?: RegExp) {
  try {
    fn();
    throw new Error('Expected DocumentApiValidationError to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(DocumentApiValidationError);
    expect((err as DocumentApiValidationError).code).toBe(code);
    if (messagePattern) {
      expect((err as DocumentApiValidationError).message).toMatch(messagePattern);
    }
  }
}

// ---------------------------------------------------------------------------
// Validation matrix — all locked error mappings
// ---------------------------------------------------------------------------

describe('styles.apply validation', () => {
  // --- Input shape ---

  it('throws INVALID_INPUT for non-object input', () => {
    const adapter = makeAdapter();
    expectValidationError(() => executeStylesApply(adapter, null as never), 'INVALID_INPUT');
    expectValidationError(() => executeStylesApply(adapter, 42 as never), 'INVALID_INPUT');
    expectValidationError(() => executeStylesApply(adapter, 'string' as never), 'INVALID_INPUT');
  });

  // --- Target validation ---

  it('throws INVALID_TARGET when target is missing', () => {
    const adapter = makeAdapter();
    expectValidationError(() => executeStylesApply(adapter, { patch: { bold: true } } as never), 'INVALID_TARGET');
  });

  it('throws INVALID_TARGET when target is not an object', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, { target: 'bad', patch: { bold: true } } as never),
      'INVALID_TARGET',
    );
  });

  it('throws INVALID_TARGET when target.scope is not docDefaults', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'namedStyle' as never, channel: 'run' },
          patch: { bold: true },
        }),
      'INVALID_TARGET',
      /scope/,
    );
  });

  it('throws INVALID_TARGET when target.channel is not run', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' as never },
          patch: { bold: true },
        }),
      'INVALID_TARGET',
      /channel/,
    );
  });

  // --- Patch validation ---

  it('throws INVALID_INPUT when patch is missing', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' } } as never),
      'INVALID_INPUT',
    );
  });

  it('throws INVALID_INPUT when patch is not an object', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: 'bad' as never,
        }),
      'INVALID_INPUT',
    );
  });

  it('throws INVALID_INPUT when patch is empty', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: {},
        }),
      'INVALID_INPUT',
      /at least one/,
    );
  });

  it('throws INVALID_INPUT for unknown patch keys', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { italic: true } as never,
        }),
      'INVALID_INPUT',
      /Unknown patch key/,
    );
  });

  it('throws INVALID_INPUT when patch.bold is not a boolean', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { bold: 'yes' as never },
        }),
      'INVALID_INPUT',
      /boolean/,
    );
  });

  // --- Unknown input fields ---

  it('throws INVALID_INPUT for unknown top-level fields', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          ...VALID_INPUT,
          extra: true,
        } as never),
      'INVALID_INPUT',
      /Unknown field/,
    );
  });

  it('throws INVALID_INPUT for unknown target fields', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run', extra: true } as never,
          patch: { bold: true },
        }),
      'INVALID_INPUT',
      /Unknown field/,
    );
  });

  // --- Options validation ---

  it('throws INVALID_INPUT for unknown options keys (including changeMode)', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, VALID_INPUT, { changeMode: 'direct' } as never),
      'INVALID_INPUT',
      /Unknown options key/,
    );
  });

  it('throws INVALID_INPUT when options.dryRun is not a boolean', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, VALID_INPUT, { dryRun: 'yes' } as never),
      'INVALID_INPUT',
      /boolean/,
    );
  });

  it('throws INVALID_INPUT when options.expectedRevision is not a string', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, VALID_INPUT, { expectedRevision: 42 } as never),
      'INVALID_INPUT',
      /string/,
    );
  });

  it('accepts valid options (dryRun and expectedRevision)', () => {
    const adapter = makeAdapter();
    const options: StylesApplyOptions = { dryRun: true, expectedRevision: '3' };
    const result = executeStylesApply(adapter, VALID_INPUT, options);
    expect(result.success).toBe(true);
  });

  it('accepts undefined/null options', () => {
    const adapter = makeAdapter();
    expect(() => executeStylesApply(adapter, VALID_INPUT, undefined)).not.toThrow();
    expect(() => executeStylesApply(adapter, VALID_INPUT)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

describe('styles.apply execution', () => {
  it('delegates to adapter with normalized options', () => {
    const adapter = makeAdapter();
    executeStylesApply(adapter, VALID_INPUT, { dryRun: true, expectedRevision: '5' });
    expect(adapter.apply).toHaveBeenCalledWith(VALID_INPUT, { dryRun: true, expectedRevision: '5' });
  });

  it('defaults dryRun to false and expectedRevision to undefined', () => {
    const adapter = makeAdapter();
    executeStylesApply(adapter, VALID_INPUT);
    expect(adapter.apply).toHaveBeenCalledWith(VALID_INPUT, { dryRun: false, expectedRevision: undefined });
  });

  it('returns the receipt from the adapter', () => {
    const adapter = makeAdapter({ changed: false, before: { bold: 'on' }, after: { bold: 'on' } });
    const receipt = executeStylesApply(adapter, VALID_INPUT);
    expect(receipt.success).toBe(true);
    if (receipt.success) {
      expect(receipt.changed).toBe(false);
      expect(receipt.before.bold).toBe('on');
      expect(receipt.after.bold).toBe('on');
    }
  });

  it('allows patch.bold: false (explicit off)', () => {
    const adapter = makeAdapter();
    const input: StylesApplyInput = {
      target: { scope: 'docDefaults', channel: 'run' },
      patch: { bold: false },
    };
    expect(() => executeStylesApply(adapter, input)).not.toThrow();
    expect(adapter.apply).toHaveBeenCalledWith(input, { dryRun: false, expectedRevision: undefined });
  });
});
