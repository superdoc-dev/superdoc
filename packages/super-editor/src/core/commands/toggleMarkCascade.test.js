import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../helpers/getMarksFromSelection.js', () => ({
  getMarksFromSelection: vi.fn(),
}));

let toggleMarkCascade;
let defaultStyleDetector;
let getStyleIdFromMarks;
let mapMarkToStyleKey;
let isStyleTokenEnabled;
let getMarksFromSelection;

beforeAll(async () => {
  ({ toggleMarkCascade, defaultStyleDetector, getStyleIdFromMarks, mapMarkToStyleKey, isStyleTokenEnabled } =
    await import('./toggleMarkCascade.js'));
  ({ getMarksFromSelection } = await import('../helpers/getMarksFromSelection.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
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
    getMarksFromSelection.mockReturnValue([makeInlineMark({ value: '0' })]);
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold')({ state, chain: chainFn, editor });

    expect(chainFn).toHaveBeenCalledOnce();
    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
    expect(chainApi.setMark).not.toHaveBeenCalled();
    expect(chainApi.run).toHaveBeenCalledOnce();
  });

  it('replaces inline mark with negation when style is active', () => {
    getMarksFromSelection.mockReturnValue([makeInlineMark({ value: '1' })]);
    const { chainFn, chainApi } = createChain();
    const negationAttrs = { value: 'negated' };

    toggleMarkCascade('bold', { styleDetector: () => true, negationAttrs })({ state, chain: chainFn, editor });

    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
    expect(chainApi.setMark).toHaveBeenCalledWith('bold', negationAttrs, { extendEmptyMarkRange: false });
    expect(chainApi.run).toHaveBeenCalledOnce();
  });

  it('removes inline mark when no style is active', () => {
    getMarksFromSelection.mockReturnValue([makeInlineMark({ value: '1' })]);
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold', { styleDetector: () => false })({ state, chain: chainFn, editor });

    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
    expect(chainApi.setMark).not.toHaveBeenCalled();
  });

  it('adds a negation mark when only style is active', () => {
    getMarksFromSelection.mockReturnValue([]);
    const { chainFn, chainApi } = createChain();
    const negationAttrs = { value: '0' };

    toggleMarkCascade('bold', { styleDetector: () => true, negationAttrs })({ state, chain: chainFn, editor });

    expect(chainApi.setMark).toHaveBeenCalledWith('bold', negationAttrs, { extendEmptyMarkRange: false });
    expect(chainApi.unsetMark).not.toHaveBeenCalled();
  });

  it('adds inline mark when neither style nor inline are active', () => {
    getMarksFromSelection.mockReturnValue([]);
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold', { styleDetector: () => false })({ state, chain: chainFn, editor });

    expect(chainApi.setMark).toHaveBeenCalledWith('bold', {}, { extendEmptyMarkRange: false });
  });

  it('respects extendEmptyMarkRange option', () => {
    getMarksFromSelection.mockReturnValue([makeInlineMark({ value: '0' })]);
    const { chainFn, chainApi } = createChain();

    toggleMarkCascade('bold', { extendEmptyMarkRange: false })({ state, chain: chainFn, editor });

    expect(chainApi.unsetMark).toHaveBeenCalledWith('bold', { extendEmptyMarkRange: false });
  });
});

describe('defaultStyleDetector', () => {
  const baseState = { selection: {} };

  const styleMark = (styleId) => ({ type: { name: 'textStyle' }, attrs: { styleId } });

  it('returns true when style explicitly enables the mark', () => {
    const editor = {
      converter: {
        linkedStyles: [{ id: 'heading1', definition: { styles: { bold: { value: '1' } } } }],
      },
    };
    const result = defaultStyleDetector({
      state: baseState,
      selectionMarks: [styleMark('heading1')],
      markName: 'bold',
      editor,
    });
    expect(result).toBe(true);
  });

  it('returns false when style value disables the mark', () => {
    const editor = {
      converter: {
        linkedStyles: [{ id: 'heading1', definition: { styles: { bold: { value: '0' } } } }],
      },
    };
    const result = defaultStyleDetector({
      state: baseState,
      selectionMarks: [styleMark('heading1')],
      markName: 'bold',
      editor,
    });
    expect(result).toBe(false);
  });

  it('returns false for style tokens that explicitly disable formatting', () => {
    const tokens = ['none', 'inherit', 'transparent'];
    for (const token of tokens) {
      const editor = {
        converter: {
          linkedStyles: [{ id: 'heading1', definition: { styles: { underline: { value: token } } } }],
        },
      };
      const result = defaultStyleDetector({
        state: baseState,
        selectionMarks: [styleMark('heading1')],
        markName: 'underline',
        editor,
      });
      expect(result).toBe(false);
    }
  });

  it('treats undefined style value as enabled', () => {
    const editor = {
      converter: {
        linkedStyles: [{ id: 'heading1', definition: { styles: { bold: undefined } } }],
      },
    };
    const result = defaultStyleDetector({
      state: baseState,
      selectionMarks: [styleMark('heading1')],
      markName: 'bold',
      editor,
    });
    expect(result).toBe(true);
  });

  it('follows basedOn chain to detect inherited style', () => {
    const editor = {
      converter: {
        linkedStyles: [
          { id: 'child', definition: { styles: {}, attrs: { basedOn: 'base' } } },
          { id: 'base', definition: { styles: { italic: { value: '1' } } } },
        ],
      },
    };
    const result = defaultStyleDetector({
      state: baseState,
      selectionMarks: [styleMark('child')],
      markName: 'italic',
      editor,
    });
    expect(result).toBe(true);
  });

  it('handles textStyle mark mapping to color', () => {
    const editor = {
      converter: {
        linkedStyles: [{ id: 'styleColor', definition: { styles: { color: { value: '#ff0000' } } } }],
      },
    };
    const result = defaultStyleDetector({
      state: baseState,
      selectionMarks: [styleMark('styleColor')],
      markName: 'textStyle',
      editor,
    });
    expect(result).toBe(true);
  });

  it('returns false when no style id can be resolved', () => {
    const state = {
      selection: {
        $from: {
          nodeBefore: null,
          nodeAfter: null,
          pos: 0,
        },
      },
      doc: { resolve: () => ({ depth: 0, node: () => ({ attrs: {} }) }) },
    };
    const editor = { converter: { linkedStyles: [] } };
    const result = defaultStyleDetector({
      state,
      selectionMarks: [],
      markName: 'bold',
      editor,
    });
    expect(result).toBe(false);
  });

  it('returns false when an error occurs', () => {
    const result = defaultStyleDetector({
      state: null,
      selectionMarks: [],
      markName: 'bold',
      editor: null,
    });
    expect(result).toBe(false);
  });
});

describe('getStyleIdFromMarks', () => {
  it('reads styleId from textStyle mark', () => {
    const marks = [{ type: { name: 'textStyle' }, attrs: { styleId: 'Heading1' } }];
    expect(getStyleIdFromMarks(marks)).toBe('Heading1');
  });

  it('returns null when style is absent', () => {
    const marks = [{ type: { name: 'em' }, attrs: {} }];
    expect(getStyleIdFromMarks(marks)).toBeNull();
  });
});

describe('mapMarkToStyleKey', () => {
  it('maps color-related marks to color key', () => {
    expect(mapMarkToStyleKey('color')).toBe('color');
    expect(mapMarkToStyleKey('textStyle')).toBe('color');
  });

  it('returns the mark name for other marks', () => {
    expect(mapMarkToStyleKey('bold')).toBe('bold');
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
