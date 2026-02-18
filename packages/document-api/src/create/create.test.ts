import { normalizeCreateParagraphInput } from './create.js';

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
