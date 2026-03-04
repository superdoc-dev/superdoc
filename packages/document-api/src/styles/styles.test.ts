import { describe, it, expect, vi } from 'vitest';
import {
  executeStylesApply,
  type StylesAdapter,
  type StylesApplyInput,
  type StylesApplyOptions,
  type StylesApplyReceipt,
} from './index.js';
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

const VALID_RUN_INPUT: StylesApplyInput = {
  target: { scope: 'docDefaults', channel: 'run' },
  patch: { bold: true },
};

const VALID_PARAGRAPH_INPUT: StylesApplyInput = {
  target: { scope: 'docDefaults', channel: 'paragraph' },
  patch: { justification: 'center' },
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
// Input shape validation
// ---------------------------------------------------------------------------

describe('styles.apply validation: input shape', () => {
  it('throws INVALID_INPUT for non-object input', () => {
    const adapter = makeAdapter();
    expectValidationError(() => executeStylesApply(adapter, null as never), 'INVALID_INPUT');
    expectValidationError(() => executeStylesApply(adapter, 42 as never), 'INVALID_INPUT');
    expectValidationError(() => executeStylesApply(adapter, 'string' as never), 'INVALID_INPUT');
  });

  it('throws INVALID_INPUT for unknown top-level fields', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, { ...VALID_RUN_INPUT, extra: true } as never),
      'INVALID_INPUT',
      /Unknown field/,
    );
  });
});

// ---------------------------------------------------------------------------
// Target validation
// ---------------------------------------------------------------------------

describe('styles.apply validation: target', () => {
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

  it('throws INVALID_TARGET for unknown target fields', () => {
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

  it('accepts channel "run"', () => {
    const adapter = makeAdapter();
    expect(() => executeStylesApply(adapter, VALID_RUN_INPUT)).not.toThrow();
  });

  it('accepts channel "paragraph"', () => {
    const adapter = makeAdapter();
    expect(() => executeStylesApply(adapter, VALID_PARAGRAPH_INPUT)).not.toThrow();
  });

  it('throws INVALID_TARGET for invalid channel value', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'table' as never },
          patch: { bold: true },
        }),
      'INVALID_TARGET',
      /channel/,
    );
  });
});

// ---------------------------------------------------------------------------
// Patch validation — run channel
// ---------------------------------------------------------------------------

describe('styles.apply validation: run patch', () => {
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
      () => executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: 'bad' as never }),
      'INVALID_INPUT',
    );
  });

  it('throws INVALID_INPUT when patch is empty', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: {} }),
      'INVALID_INPUT',
      /at least one/,
    );
  });

  it('throws INVALID_INPUT for paragraph keys on run channel', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { justification: 'center' } as never,
        }),
      'INVALID_INPUT',
      /paragraph-channel/,
    );
  });

  it('throws INVALID_INPUT for completely unknown patch keys', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fakeProperty: true } as never,
        }),
      'INVALID_INPUT',
    );
  });

  // Boolean properties
  it('accepts bold: true/false', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: true } }),
    ).not.toThrow();
    expect(() =>
      executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: { bold: false } }),
    ).not.toThrow();
  });

  it('throws INVALID_INPUT when bold is not a boolean', () => {
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

  it('accepts italic: true/false', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: { italic: true } }),
    ).not.toThrow();
    expect(() =>
      executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: { italic: false } }),
    ).not.toThrow();
  });

  it('throws INVALID_INPUT when italic is not a boolean', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { italic: 'yes' as never },
        }),
      'INVALID_INPUT',
      /boolean/,
    );
  });

  // Number properties
  it('accepts valid integer for fontSize', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: { fontSize: 24 } }),
    ).not.toThrow();
  });

  it('rejects NaN for fontSize', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fontSize: NaN } as never,
        }),
      'INVALID_INPUT',
      /finite integer/,
    );
  });

  it('rejects Infinity for fontSize', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fontSize: Infinity } as never,
        }),
      'INVALID_INPUT',
      /finite integer/,
    );
  });

  it('rejects non-integer for fontSize', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fontSize: 1.5 } as never,
        }),
      'INVALID_INPUT',
      /finite integer/,
    );
  });

  it('accepts negative integers for letterSpacing', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, { target: { scope: 'docDefaults', channel: 'run' }, patch: { letterSpacing: -20 } }),
    ).not.toThrow();
  });

  // Object properties
  it('accepts valid fontFamily object', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { fontFamily: { ascii: 'Arial', hAnsi: 'Arial' } },
      }),
    ).not.toThrow();
  });

  it('rejects unknown sub-keys on fontFamily', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fontFamily: { unknown: 'val' } as never },
        }),
      'INVALID_INPUT',
      /Unknown key/,
    );
  });

  it('rejects non-string sub-values on fontFamily', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fontFamily: { ascii: 42 } as never },
        }),
      'INVALID_INPUT',
      /string/,
    );
  });

  it('rejects empty fontFamily object', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'run' },
          patch: { fontFamily: {} as never },
        }),
      'INVALID_INPUT',
      /at least one/,
    );
  });

  it('accepts valid color object', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'run' },
        patch: { color: { val: 'FF0000' } },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Patch validation — paragraph channel
// ---------------------------------------------------------------------------

describe('styles.apply validation: paragraph patch', () => {
  it('throws INVALID_INPUT for run keys on paragraph channel', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { bold: true } as never,
        }),
      'INVALID_INPUT',
      /run-channel/,
    );
  });

  // Enum properties
  it('accepts valid justification values', () => {
    const adapter = makeAdapter();
    for (const val of ['left', 'center', 'right', 'justify', 'distribute']) {
      expect(() =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { justification: val },
        }),
      ).not.toThrow();
    }
  });

  it('rejects OOXML "both" alias for justification', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { justification: 'both' as never },
        }),
      'INVALID_INPUT',
      /must be one of/,
    );
  });

  it('rejects invalid justification', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { justification: 'invalid' as never },
        }),
      'INVALID_INPUT',
      /must be one of/,
    );
  });

  // Object properties — spacing
  it('accepts valid spacing object', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { spacing: { before: 240, lineRule: 'exact' } },
      }),
    ).not.toThrow();
  });

  it('rejects invalid lineRule in spacing', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { spacing: { lineRule: 'invalid' } as never },
        }),
      'INVALID_INPUT',
      /must be one of/,
    );
  });

  it('rejects non-integer spacing.before', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { spacing: { before: 1.5 } as never },
        }),
      'INVALID_INPUT',
      /finite integer/,
    );
  });

  it('validates boolean sub-keys in spacing', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { spacing: { afterAutospacing: 'yes' } as never },
        }),
      'INVALID_INPUT',
      /boolean/,
    );
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { spacing: { afterAutospacing: true } },
      }),
    ).not.toThrow();
  });

  // Object properties — indent
  it('accepts valid indent object', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeStylesApply(adapter, {
        target: { scope: 'docDefaults', channel: 'paragraph' },
        patch: { indent: { firstLine: 720 } },
      }),
    ).not.toThrow();
  });

  it('rejects unknown indent sub-keys', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () =>
        executeStylesApply(adapter, {
          target: { scope: 'docDefaults', channel: 'paragraph' },
          patch: { indent: { unknown: 42 } as never },
        }),
      'INVALID_INPUT',
      /Unknown key/,
    );
  });
});

// ---------------------------------------------------------------------------
// Options validation
// ---------------------------------------------------------------------------

describe('styles.apply validation: options', () => {
  it('throws INVALID_INPUT for unknown options keys (including changeMode)', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, VALID_RUN_INPUT, { changeMode: 'direct' } as never),
      'INVALID_INPUT',
      /Unknown options key/,
    );
  });

  it('throws INVALID_INPUT when options.dryRun is not a boolean', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, VALID_RUN_INPUT, { dryRun: 'yes' } as never),
      'INVALID_INPUT',
      /boolean/,
    );
  });

  it('throws INVALID_INPUT when options.expectedRevision is not a string', () => {
    const adapter = makeAdapter();
    expectValidationError(
      () => executeStylesApply(adapter, VALID_RUN_INPUT, { expectedRevision: 42 } as never),
      'INVALID_INPUT',
      /string/,
    );
  });

  it('accepts valid options (dryRun and expectedRevision)', () => {
    const adapter = makeAdapter();
    const options: StylesApplyOptions = { dryRun: true, expectedRevision: '3' };
    const result = executeStylesApply(adapter, VALID_RUN_INPUT, options);
    expect(result.success).toBe(true);
  });

  it('accepts undefined/null options', () => {
    const adapter = makeAdapter();
    expect(() => executeStylesApply(adapter, VALID_RUN_INPUT, undefined)).not.toThrow();
    expect(() => executeStylesApply(adapter, VALID_RUN_INPUT)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Execution delegation
// ---------------------------------------------------------------------------

describe('styles.apply execution', () => {
  it('delegates to adapter with normalized options', () => {
    const adapter = makeAdapter();
    executeStylesApply(adapter, VALID_RUN_INPUT, { dryRun: true, expectedRevision: '5' });
    expect(adapter.apply).toHaveBeenCalledWith(VALID_RUN_INPUT, { dryRun: true, expectedRevision: '5' });
  });

  it('defaults dryRun to false and expectedRevision to undefined', () => {
    const adapter = makeAdapter();
    executeStylesApply(adapter, VALID_RUN_INPUT);
    expect(adapter.apply).toHaveBeenCalledWith(VALID_RUN_INPUT, { dryRun: false, expectedRevision: undefined });
  });

  it('returns the receipt from the adapter', () => {
    const adapter = makeAdapter({ changed: false, before: { bold: 'on' }, after: { bold: 'on' } });
    const receipt = executeStylesApply(adapter, VALID_RUN_INPUT);
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

  it('delegates paragraph channel to adapter', () => {
    const adapter = makeAdapter();
    executeStylesApply(adapter, VALID_PARAGRAPH_INPUT);
    expect(adapter.apply).toHaveBeenCalledWith(VALID_PARAGRAPH_INPUT, { dryRun: false, expectedRevision: undefined });
  });
});
