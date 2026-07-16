import { describe, expect, it, mock } from 'bun:test';
import { DocumentApiValidationError } from '../errors.js';
import type {
  ParagraphMutationResult,
  ParagraphsAdapter,
  ParagraphsClearTabStopInput,
  ParagraphsSetIndentationInput,
  ParagraphsSetNumberingInput,
  ParagraphsSetTabStopInput,
} from './paragraphs.js';
import {
  executeParagraphsClearTabStop,
  executeParagraphsSetFlowOptions,
  executeParagraphsSetIndentation,
  executeParagraphsSetNumbering,
  executeParagraphsSetTabStop,
} from './paragraphs.js';

function makeTarget() {
  return {
    kind: 'block' as const,
    nodeType: 'paragraph' as const,
    nodeId: 'p1',
  };
}

function makeAdapter(): ParagraphsAdapter & {
  setIndentation: ReturnType<typeof mock>;
} {
  const success: ParagraphMutationResult = {
    success: true,
    target: makeTarget(),
    resolution: {
      target: makeTarget(),
    },
  };

  return {
    setStyle: mock(() => success),
    clearStyle: mock(() => success),
    resetDirectFormatting: mock(() => success),
    setAlignment: mock(() => success),
    clearAlignment: mock(() => success),
    setIndentation: mock(() => success),
    clearIndentation: mock(() => success),
    setSpacing: mock(() => success),
    clearSpacing: mock(() => success),
    setKeepOptions: mock(() => success),
    setOutlineLevel: mock(() => success),
    setFlowOptions: mock(() => success),
    setTabStop: mock(() => success),
    clearTabStop: mock(() => success),
    clearAllTabStops: mock(() => success),
    setBorder: mock(() => success),
    clearBorder: mock(() => success),
    setShading: mock(() => success),
    clearShading: mock(() => success),
    setDirection: mock(() => success),
    clearDirection: mock(() => success),
    setNumbering: mock(() => success),
  } as ParagraphsAdapter & {
    setIndentation: ReturnType<typeof mock>;
  };
}

describe('executeParagraphsSetNumbering', () => {
  it('delegates to the adapter for valid input', () => {
    const adapter = makeAdapter();
    const result = executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: 2, level: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts an omitted level', () => {
    const adapter = makeAdapter();
    const result = executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: 2 });
    expect(result.success).toBe(true);
  });

  it('throws when numId is missing', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeParagraphsSetNumbering(adapter, { target: makeTarget() } as ParagraphsSetNumberingInput),
    ).toThrow(DocumentApiValidationError);
  });

  it('throws when numId is not a positive integer (0 is the no-numbering sentinel)', () => {
    const adapter = makeAdapter();
    expect(() => executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: 0 })).toThrow(
      DocumentApiValidationError,
    );
    expect(() => executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: -1 })).toThrow(
      DocumentApiValidationError,
    );
    expect(() => executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: 1.5 })).toThrow(
      DocumentApiValidationError,
    );
  });

  it('throws when level is outside 0-8', () => {
    const adapter = makeAdapter();
    expect(() => executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: 2, level: 9 })).toThrow(
      DocumentApiValidationError,
    );
    expect(() => executeParagraphsSetNumbering(adapter, { target: makeTarget(), numId: 2, level: -1 })).toThrow(
      DocumentApiValidationError,
    );
  });
});

describe('executeParagraphsSetIndentation', () => {
  it('accepts signed left and right indentation values', () => {
    const adapter = makeAdapter();
    const input: ParagraphsSetIndentationInput = {
      target: makeTarget(),
      left: -108,
      right: -2,
      hanging: 255,
    };

    const result = executeParagraphsSetIndentation(adapter, input);

    expect(result.success).toBe(true);
    expect(adapter.setIndentation).toHaveBeenCalledWith(input, expect.objectContaining({ changeMode: 'direct' }));
  });

  it('rejects non-integer signed indentation values', () => {
    const adapter = makeAdapter();

    expect(() =>
      executeParagraphsSetIndentation(adapter, {
        target: makeTarget(),
        left: 1.5 as any,
      }),
    ).toThrow(DocumentApiValidationError);

    try {
      executeParagraphsSetIndentation(adapter, {
        target: makeTarget(),
        left: 1.5 as any,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiValidationError);
      expect((error as DocumentApiValidationError).message).toContain('left must be an integer');
    }
  });

  it('still rejects negative firstLine indentation', () => {
    const adapter = makeAdapter();

    expect(() =>
      executeParagraphsSetIndentation(adapter, {
        target: makeTarget(),
        firstLine: -1 as any,
      }),
    ).toThrow(DocumentApiValidationError);

    try {
      executeParagraphsSetIndentation(adapter, {
        target: makeTarget(),
        firstLine: -1 as any,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiValidationError);
      expect((error as DocumentApiValidationError).message).toContain('firstLine must be a non-negative integer');
    }
  });
});

describe('executeParagraphsSetTabStop', () => {
  it('rejects clear as a setTabStop alignment (callers translate clear -> clearTabStop)', () => {
    // The public tab-stop contract is intentionally strict: alignment must be
    // one of left/center/right/decimal/bar. OOXML `w:tab w:val="clear"` removes
    // an inherited tab stop and is modeled as clearTabStop, not a setTabStop
    // alignment. Authoring layers translate `clear` tabs into clearTabStop
    // rather than emitting an invalid setTabStop input.
    const adapter = makeAdapter();
    const input = {
      target: makeTarget(),
      position: 567,
      alignment: 'clear',
    } as unknown as ParagraphsSetTabStopInput;

    expect(() => executeParagraphsSetTabStop(adapter, input)).toThrow(DocumentApiValidationError);

    try {
      executeParagraphsSetTabStop(adapter, input);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentApiValidationError);
      expect((error as DocumentApiValidationError).message).toContain(
        'alignment must be one of: left, center, right, decimal, bar',
      );
    }
    expect(adapter.setTabStop).not.toHaveBeenCalled();
  });

  it('accepts signed tab-stop positions', () => {
    const adapter = makeAdapter();
    const input: ParagraphsSetTabStopInput = {
      target: makeTarget(),
      position: -720,
      alignment: 'left',
    };

    const result = executeParagraphsSetTabStop(adapter, input);

    expect(result.success).toBe(true);
    expect(adapter.setTabStop).toHaveBeenCalledWith(input, expect.objectContaining({ changeMode: 'direct' }));
  });
});

describe('executeParagraphsClearTabStop', () => {
  it('accepts signed tab-stop positions', () => {
    const adapter = makeAdapter();
    const input: ParagraphsClearTabStopInput = {
      target: makeTarget(),
      position: -720,
    };

    const result = executeParagraphsClearTabStop(adapter, input);

    expect(result.success).toBe(true);
    expect(adapter.clearTabStop).toHaveBeenCalledWith(input, expect.objectContaining({ changeMode: 'direct' }));
  });
});

describe('executeParagraphsSetFlowOptions', () => {
  it('accepts the advanced layout booleans', () => {
    const adapter = makeAdapter();
    const input = {
      target: makeTarget(),
      autoSpaceDE: true,
      autoSpaceDN: true,
      adjustRightInd: false,
      snapToGrid: false,
    };

    const result = executeParagraphsSetFlowOptions(adapter, input);

    expect(result.success).toBe(true);
    expect(adapter.setFlowOptions).toHaveBeenCalledWith(input, expect.objectContaining({ changeMode: 'direct' }));
  });

  it('still accepts the original flow flags on their own', () => {
    const adapter = makeAdapter();
    const result = executeParagraphsSetFlowOptions(adapter, {
      target: makeTarget(),
      contextualSpacing: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean advanced layout values', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeParagraphsSetFlowOptions(adapter, {
        target: makeTarget(),
        // @ts-expect-error intentional invalid value
        autoSpaceDE: 'yes',
      }),
    ).toThrow(DocumentApiValidationError);
  });

  it('rejects an empty patch with no flow flags', () => {
    const adapter = makeAdapter();
    expect(() =>
      executeParagraphsSetFlowOptions(adapter, {
        target: makeTarget(),
      }),
    ).toThrow(DocumentApiValidationError);
  });
});
