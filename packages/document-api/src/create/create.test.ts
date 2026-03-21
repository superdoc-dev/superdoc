import { describe, expect, it, mock } from 'bun:test';
import {
  executeCreateParagraph,
  executeCreateHeading,
  executeCreateSectionBreak,
  executeCreateTable,
  normalizeCreateParagraphInput,
} from './create.js';

describe('normalizeCreateParagraphInput', () => {
  it('defaults location to documentEnd when at is omitted', () => {
    const result = normalizeCreateParagraphInput({});

    expect(result.at).toEqual({ kind: 'documentEnd' });
  });

  it('defaults text to empty string when omitted', () => {
    const result = normalizeCreateParagraphInput({});

    expect(result.text).toBe('');
  });

  it('defaults both at and text when input is empty', () => {
    const result = normalizeCreateParagraphInput({});

    expect(result).toEqual({
      at: { kind: 'documentEnd' },
      text: '',
    });
  });

  it('preserves explicit documentStart location', () => {
    const result = normalizeCreateParagraphInput({ at: { kind: 'documentStart' } });

    expect(result.at).toEqual({ kind: 'documentStart' });
  });

  it('preserves explicit before location with target', () => {
    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' };
    const result = normalizeCreateParagraphInput({ at: { kind: 'before', target } });

    expect(result.at).toEqual({ kind: 'before', target });
  });

  it('preserves explicit after location with target', () => {
    const target = { kind: 'block' as const, nodeType: 'heading' as const, nodeId: 'h1' };
    const result = normalizeCreateParagraphInput({ at: { kind: 'after', target } });

    expect(result.at).toEqual({ kind: 'after', target });
  });

  it('preserves explicit text', () => {
    const result = normalizeCreateParagraphInput({ text: 'Hello world' });

    expect(result.text).toBe('Hello world');
  });

  it('preserves both explicit at and text', () => {
    const result = normalizeCreateParagraphInput({
      at: { kind: 'documentStart' },
      text: 'First paragraph',
    });

    expect(result).toEqual({
      at: { kind: 'documentStart' },
      text: 'First paragraph',
    });
  });
});

describe('executeCreateTable', () => {
  it('accepts nodeId-based before/after placement without requiring at.target', () => {
    const adapter = {
      paragraph: () => ({ success: true }),
      heading: () => ({ success: true }),
      table: () => ({
        success: true,
        table: { kind: 'block', nodeType: 'table', nodeId: 'new-table' },
      }),
    } as any;

    expect(() =>
      executeCreateTable(adapter, {
        rows: 2,
        columns: 2,
        at: { kind: 'after', nodeId: 'p1' },
      }),
    ).not.toThrow();
  });

  it('rejects ambiguous before/after placement when both at.target and at.nodeId are provided', () => {
    let tableCalled = false;
    const adapter = {
      paragraph: () => ({ success: true }),
      heading: () => ({ success: true }),
      table: () => {
        tableCalled = true;
        return {
          success: true,
          table: { kind: 'block', nodeType: 'table', nodeId: 'new-table' },
        };
      },
    } as any;
    const target = { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' };

    expect(() =>
      executeCreateTable(adapter, {
        rows: 2,
        columns: 2,
        at: { kind: 'after', target, nodeId: 'p1' } as any,
      }),
    ).toThrow(/Cannot combine/i);
    expect(tableCalled).toBe(false);
  });
});

describe('create.paragraph input validation', () => {
  const adapter = {
    paragraph: mock(() => ({
      success: true,
      paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      insertionPoint: { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } },
    })),
    heading: () => ({ success: true }),
    table: () => ({ success: true }),
  } as any;

  it('rejects null input', () => {
    expect(() => executeCreateParagraph(adapter, null as any)).toThrow(/non-null object/);
  });

  it('rejects invalid story locator', () => {
    expect(() => executeCreateParagraph(adapter, { in: { kind: 'bogus' } } as any)).toThrow(/StoryLocator/);
  });
});

describe('create.heading input validation', () => {
  const adapter = {
    paragraph: () => ({ success: true }),
    heading: mock(() => ({
      success: true,
      heading: { kind: 'block', nodeType: 'heading', nodeId: 'h1' },
      insertionPoint: { kind: 'text', blockId: 'h1', range: { start: 0, end: 0 } },
    })),
    table: () => ({ success: true }),
  } as any;

  it('rejects null input', () => {
    expect(() => executeCreateHeading(adapter, null as any)).toThrow(/non-null object/);
  });

  it('rejects undefined input', () => {
    expect(() => executeCreateHeading(adapter, undefined as any)).toThrow(/non-null object/);
  });

  it('rejects missing level', () => {
    expect(() => executeCreateHeading(adapter, {} as any)).toThrow(/level must be an integer 1–6/);
  });

  it('rejects level 0', () => {
    expect(() => executeCreateHeading(adapter, { level: 0 } as any)).toThrow(/level must be an integer 1–6/);
  });

  it('rejects level 7', () => {
    expect(() => executeCreateHeading(adapter, { level: 7 } as any)).toThrow(/level must be an integer 1–6/);
  });

  it('rejects level 99', () => {
    expect(() => executeCreateHeading(adapter, { level: 99 } as any)).toThrow(/level must be an integer 1–6/);
  });

  it('rejects string level', () => {
    expect(() => executeCreateHeading(adapter, { level: '2' } as any)).toThrow(/level must be an integer 1–6/);
  });

  it('accepts valid levels 1-6', () => {
    for (let level = 1; level <= 6; level++) {
      expect(() => executeCreateHeading(adapter, { level: level as any })).not.toThrow();
    }
  });

  it('rejects invalid story locator', () => {
    expect(() => executeCreateHeading(adapter, { level: 1, in: { kind: 'bogus' } } as any)).toThrow(/StoryLocator/);
  });
});

describe('create.table input validation', () => {
  const adapter = {
    paragraph: () => ({ success: true }),
    heading: () => ({ success: true }),
    table: mock(() => ({
      success: true,
      table: { kind: 'block', nodeType: 'table', nodeId: 'new-table' },
    })),
  } as any;

  it('rejects null input', () => {
    expect(() => executeCreateTable(adapter, null as any)).toThrow(/non-null object/);
  });

  it('rejects undefined input', () => {
    expect(() => executeCreateTable(adapter, undefined as any)).toThrow(/non-null object/);
  });

  it('rejects missing rows', () => {
    expect(() => executeCreateTable(adapter, { columns: 2 } as any)).toThrow(/rows must be a positive integer/);
  });

  it('rejects zero rows', () => {
    expect(() => executeCreateTable(adapter, { rows: 0, columns: 2 })).toThrow(/rows must be a positive integer/);
  });

  it('rejects negative rows', () => {
    expect(() => executeCreateTable(adapter, { rows: -1, columns: 2 })).toThrow(/rows must be a positive integer/);
  });

  it('rejects string rows', () => {
    expect(() => executeCreateTable(adapter, { rows: '2', columns: 2 } as any)).toThrow(
      /rows must be a positive integer/,
    );
  });

  it('rejects zero columns', () => {
    expect(() => executeCreateTable(adapter, { rows: 2, columns: 0 })).toThrow(/columns must be a positive integer/);
  });

  it('rejects float columns', () => {
    expect(() => executeCreateTable(adapter, { rows: 2, columns: 2.5 })).toThrow(/columns must be a positive integer/);
  });

  it('accepts valid rows and columns', () => {
    expect(() => executeCreateTable(adapter, { rows: 3, columns: 4 })).not.toThrow();
  });
});

describe('create target validation', () => {
  it('rejects nodeId-based before/after placement for create.paragraph', () => {
    let paragraphCalled = false;
    const adapter = {
      paragraph: () => {
        paragraphCalled = true;
        return {
          success: true,
          paragraph: { kind: 'block', nodeType: 'paragraph', nodeId: 'p2' },
          insertionPoint: { kind: 'text', blockId: 'p2', range: { start: 0, end: 0 } },
        };
      },
      heading: () => ({ success: true }),
      table: () => ({ success: true }),
      sectionBreak: () => ({ success: true }),
    } as any;

    expect(() =>
      executeCreateParagraph(adapter, {
        at: { kind: 'after', nodeId: 'p1' } as any,
      }),
    ).toThrow(/does not support at\.nodeId/i);
    expect(paragraphCalled).toBe(false);
  });
});

describe('executeCreateSectionBreak', () => {
  it('defaults create.sectionBreak location to documentEnd', () => {
    const adapter = {
      paragraph: () => ({ success: true }),
      heading: () => ({ success: true }),
      table: () => ({ success: true }),
      sectionBreak: mock(() => ({
        success: true,
        section: { kind: 'section', sectionId: 'section-1' },
      })),
    } as any;

    executeCreateSectionBreak(adapter, { breakType: 'nextPage' });

    expect(adapter.sectionBreak).toHaveBeenCalledWith(
      expect.objectContaining({
        at: { kind: 'documentEnd' },
        breakType: 'nextPage',
      }),
      { changeMode: 'direct', dryRun: false, expectedRevision: undefined },
    );
  });

  it('rejects invalid section break type', () => {
    const adapter = {
      paragraph: () => ({ success: true }),
      heading: () => ({ success: true }),
      table: () => ({ success: true }),
      sectionBreak: mock(() => ({ success: true })),
    } as any;

    expect(() =>
      executeCreateSectionBreak(adapter, {
        breakType: 'invalidBreakType' as any,
      }),
    ).toThrow(/create\.sectionBreak breakType must be one of/i);
  });

  it('rejects nodeId-based before/after placement', () => {
    const adapter = {
      paragraph: () => ({ success: true }),
      heading: () => ({ success: true }),
      table: () => ({ success: true }),
      sectionBreak: mock(() => ({ success: true })),
    } as any;

    expect(() =>
      executeCreateSectionBreak(adapter, {
        at: { kind: 'before', nodeId: 'p1' } as any,
      }),
    ).toThrow(/does not support at\.nodeId/i);
    expect(adapter.sectionBreak).not.toHaveBeenCalled();
  });
});
