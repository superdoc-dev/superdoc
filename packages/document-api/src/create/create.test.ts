import { executeCreateTable, normalizeCreateParagraphInput } from './create.js';

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
