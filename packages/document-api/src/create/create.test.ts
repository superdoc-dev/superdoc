import {
  executeCreateParagraph,
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
      sectionBreak: vi.fn(() => ({
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
      sectionBreak: vi.fn(() => ({ success: true })),
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
      sectionBreak: vi.fn(() => ({ success: true })),
    } as any;

    expect(() =>
      executeCreateSectionBreak(adapter, {
        at: { kind: 'before', nodeId: 'p1' } as any,
      }),
    ).toThrow(/does not support at\.nodeId/i);
    expect(adapter.sectionBreak).not.toHaveBeenCalled();
  });
});
