import { describe, expect, it, vi, assertType } from 'vitest';
import type { FormatAdapter, FormatInlineAliasInput, StyleApplyInput } from './format.js';
import { executeStyleApply, executeAlign, executeInlineAlias } from './format.js';
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
    align: vi.fn(() => makeReceipt()),
  };
}

describe('executeStyleApply validation', () => {
  it('rejects non-object input', () => {
    const adapter = makeAdapter();
    expect(() => executeStyleApply(adapter, null as any)).toThrow(DocumentApiValidationError);
    expect(() => executeStyleApply(adapter, 42 as any)).toThrow('non-null object');
    expect(() => executeStyleApply(adapter, 'bad' as any)).toThrow('non-null object');
  });

  it('rejects unknown top-level fields', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: { bold: true }, extra: 1 };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('extra');
  });

  it('rejects missing target', () => {
    const adapter = makeAdapter();
    const input = { inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('requires a target');
  });

  it('rejects invalid target', () => {
    const adapter = makeAdapter();
    const input = { target: 'not-an-address', inline: { bold: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('text address');
  });

  it('accepts valid target', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: true } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
  });

  it('rejects missing inline', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET };
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
    const input = { target: TARGET, inline: { superscript: true } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('Unknown inline style key "superscript"');
  });

  it('rejects invalid boolean payload type', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: { bold: 'yes' } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('inline.bold must be boolean or null');
  });

  it('rejects empty object patch values', () => {
    const adapter = makeAdapter();
    const input = { target: TARGET, inline: { shading: {} } };
    expect(() => executeStyleApply(adapter, input as any)).toThrow('inline.shading object must not be empty');
  });

  it('accepts boolean tri-state payloads', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { bold: null, italic: false } };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
    expect(adapter.apply).toHaveBeenCalledWith(input, expect.objectContaining({ changeMode: 'direct' }));
  });

  it('accepts numeric and object inline properties in one call', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = {
      target: TARGET,
      inline: {
        fontSize: 12,
        underline: { style: 'single', color: 'FF0000' },
      },
    };
    const result = executeStyleApply(adapter, input);
    expect(result.success).toBe(true);
  });

  it('passes through tracked and dryRun options', () => {
    const adapter = makeAdapter();
    const input: StyleApplyInput = { target: TARGET, inline: { color: '00AA00' } };
    executeStyleApply(adapter, input, { changeMode: 'tracked', dryRun: true });
    expect(adapter.apply).toHaveBeenCalledWith(input, { changeMode: 'tracked', dryRun: true });
  });
});

function targetValidationSuite(
  name: string,
  exec: (adapter: ReturnType<typeof makeAdapter>, input: unknown, options?: unknown) => unknown,
) {
  describe(`${name} target validation`, () => {
    it('rejects non-object input', () => {
      expect(() => exec(makeAdapter(), null)).toThrow(DocumentApiValidationError);
    });

    it('rejects missing target', () => {
      expect(() => exec(makeAdapter(), { alignment: 'left' })).toThrow('requires a target');
    });

    it('rejects invalid target', () => {
      expect(() => exec(makeAdapter(), { target: 'bad', alignment: 'left' })).toThrow('text address');
    });
  });
}

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

// ---------------------------------------------------------------------------
// executeInlineAlias — runtime + type contract
// ---------------------------------------------------------------------------

describe('executeInlineAlias', () => {
  it('format.bold accepts omitted value (defaults to true)', () => {
    const adapter = makeAdapter();
    executeInlineAlias(adapter, 'bold', { target: TARGET });
    expect(adapter.apply).toHaveBeenCalledWith(
      { target: TARGET, inline: { bold: true } },
      expect.objectContaining({ changeMode: 'direct' }),
    );
  });

  it('format.underline accepts omitted value (defaults to true)', () => {
    const adapter = makeAdapter();
    executeInlineAlias(adapter, 'underline', { target: TARGET });
    expect(adapter.apply).toHaveBeenCalledWith(
      { target: TARGET, inline: { underline: true } },
      expect.objectContaining({ changeMode: 'direct' }),
    );
  });

  it('format.color requires value — throws when omitted', () => {
    const adapter = makeAdapter();
    expect(() => executeInlineAlias(adapter, 'color', { target: TARGET } as any)).toThrow(
      'format.color requires a value field',
    );
  });

  it('format.rFonts requires value — throws when omitted', () => {
    const adapter = makeAdapter();
    expect(() => executeInlineAlias(adapter, 'rFonts', { target: TARGET } as any)).toThrow(
      'format.rFonts requires a value field',
    );
  });

  it('format.fontSize requires value — throws when omitted', () => {
    const adapter = makeAdapter();
    expect(() => executeInlineAlias(adapter, 'fontSize', { target: TARGET } as any)).toThrow(
      'format.fontSize requires a value field',
    );
  });

  it('format.color accepts explicit value', () => {
    const adapter = makeAdapter();
    executeInlineAlias(adapter, 'color', { target: TARGET, value: 'FF0000' });
    expect(adapter.apply).toHaveBeenCalledWith(
      { target: TARGET, inline: { color: 'FF0000' } },
      expect.objectContaining({ changeMode: 'direct' }),
    );
  });
});

// ---------------------------------------------------------------------------
// FormatInlineAliasInput — compile-time type shape assertions
// ---------------------------------------------------------------------------

describe('FormatInlineAliasInput type contract', () => {
  it('boolean keys allow omitted value', () => {
    // These should all compile — value is optional for boolean keys.
    assertType<FormatInlineAliasInput<'bold'>>({ target: TARGET });
    assertType<FormatInlineAliasInput<'bold'>>({ target: TARGET, value: true });
    assertType<FormatInlineAliasInput<'italic'>>({ target: TARGET });
    assertType<FormatInlineAliasInput<'strike'>>({ target: TARGET });
    assertType<FormatInlineAliasInput<'dstrike'>>({ target: TARGET });
    assertType<FormatInlineAliasInput<'vanish'>>({ target: TARGET });
  });

  it('underline allows omitted value', () => {
    assertType<FormatInlineAliasInput<'underline'>>({ target: TARGET });
    assertType<FormatInlineAliasInput<'underline'>>({ target: TARGET, value: true });
    assertType<FormatInlineAliasInput<'underline'>>({ target: TARGET, value: { style: 'single' } });
  });

  it('non-boolean keys require value', () => {
    // color requires value
    assertType<FormatInlineAliasInput<'color'>>({ target: TARGET, value: 'FF0000' });
    // @ts-expect-error — value is required for color
    assertType<FormatInlineAliasInput<'color'>>({ target: TARGET });

    // fontSize requires value
    assertType<FormatInlineAliasInput<'fontSize'>>({ target: TARGET, value: 12 });
    // @ts-expect-error — value is required for fontSize
    assertType<FormatInlineAliasInput<'fontSize'>>({ target: TARGET });

    // rFonts requires value
    assertType<FormatInlineAliasInput<'rFonts'>>({ target: TARGET, value: { ascii: 'Arial' } });
    // @ts-expect-error — value is required for rFonts
    assertType<FormatInlineAliasInput<'rFonts'>>({ target: TARGET });
  });
});
