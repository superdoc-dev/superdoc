import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../helpers/getMarksFromSelection.js', () => ({
  getSelectionFormattingState: vi.fn(),
}));

let toggleMarkCascade;
let isStyleTokenEnabled;
let getSelectionFormattingState;

beforeAll(async () => {
  ({ toggleMarkCascade, isStyleTokenEnabled } = await import('./toggleMarkCascade.js'));
  ({ getSelectionFormattingState } = await import('../helpers/getMarksFromSelection.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
  getSelectionFormattingState.mockReturnValue({
    resolvedMarks: [],
    inlineMarks: [],
    resolvedRunProperties: null,
    inlineRunProperties: null,
    styleRunProperties: null,
  });
});

const makeInlineMark = (attrs = {}) => ({ type: { name: 'bold' }, attrs });

const createChain = () => {
  const chainApi = {
    unsetMark: vi.fn(() => chainApi),
    setMark: vi.fn(() => chainApi),
    run: vi.fn(() => true),
  };
  return { chainFn: vi.fn(() => chainApi), chainApi };
};

describe('toggleMarkCascade', () => {
  const state = { selection: {} };
  const editor = {};

  it('removes an existing negation mark', () => {
    getSelectionFormattingState.mockReturnValue({
      inlineMarks: [makeInlineMark({ value: '0' })],
      inlineRunProperties: { bold: false },
      styleRunProperties: { bold: true },
    });
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold')({ state, chain: chainFn, editor });

    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
    expect(chainApi.setMark).not.toHaveBeenCalled();
  });

  it('replaces direct inline formatting with negation when style is also active', () => {
    getSelectionFormattingState.mockReturnValue({
      inlineMarks: [makeInlineMark({ value: '1' })],
      inlineRunProperties: { bold: true },
      styleRunProperties: { bold: true },
    });
    const { chainFn, chainApi } = createChain();
    const negationAttrs = { value: 'negated' };

    toggleMarkCascade('bold', { negationAttrs })({ state, chain: chainFn, editor });

    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
    expect(chainApi.setMark).toHaveBeenCalledWith('bold', negationAttrs, { extendEmptyMarkRange: false });
  });

  it('removes direct inline formatting when no style is active', () => {
    getSelectionFormattingState.mockReturnValue({
      inlineMarks: [makeInlineMark({ value: '1' })],
      inlineRunProperties: { bold: true },
      styleRunProperties: null,
    });
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold')({ state, chain: chainFn, editor });

    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
    expect(chainApi.setMark).not.toHaveBeenCalled();
  });

  it('adds a negation mark when only style is active', () => {
    getSelectionFormattingState.mockReturnValue({
      inlineMarks: [],
      inlineRunProperties: null,
      styleRunProperties: { bold: true },
    });
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold')({ state, chain: chainFn, editor });

    expect(chainApi.setMark).toHaveBeenCalledWith('bold', { value: '0' }, { extendEmptyMarkRange: false });
    expect(chainApi.unsetMark).not.toHaveBeenCalled();
  });

  it('adds inline mark when neither direct nor style formatting is active', () => {
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold')({ state, chain: chainFn, editor });

    expect(chainApi.setMark).toHaveBeenCalledWith('bold', {}, { extendEmptyMarkRange: false });
  });

  it('treats intersected range state as authoritative for direct formatting', () => {
    getSelectionFormattingState.mockReturnValue({
      inlineMarks: [],
      inlineRunProperties: null,
      styleRunProperties: null,
    });
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold')({ state, chain: chainFn, editor });

    expect(chainApi.setMark).toHaveBeenCalledWith('bold', {}, { extendEmptyMarkRange: false });
    expect(chainApi.unsetMark).not.toHaveBeenCalled();
  });
});

describe('isStyleTokenEnabled', () => {
  it('returns false for explicit falsy states', () => {
    expect(isStyleTokenEnabled(false)).toBe(false);
    expect(isStyleTokenEnabled(0)).toBe(false);
    expect(isStyleTokenEnabled(null)).toBe(false);
  });

  it('normalizes string tokens that disable styling', () => {
    const disabling = ['0', 'false', 'none', 'inherit', 'transparent', ''];
    for (const token of disabling) {
      expect(isStyleTokenEnabled(token)).toBe(false);
    }
    expect(isStyleTokenEnabled('   ')).toBe(false);
  });

  it('returns true for non-empty truthy values', () => {
    expect(isStyleTokenEnabled('1')).toBe(true);
    expect(isStyleTokenEnabled('Bold ')).toBe(true);
    expect(isStyleTokenEnabled({})).toBe(true);
    expect(isStyleTokenEnabled(12)).toBe(true);
  });
});
