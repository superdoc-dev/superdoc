import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('prosemirror-transform', () => ({
  canJoin: vi.fn(),
  findWrapping: vi.fn(),
}));

vi.mock('../InputRule.js', () => {
  return {
    InputRule: class {
      constructor(config) {
        this.match = config.match;
        this.handler = config.handler;
      }
    },
  };
});

vi.mock('../utilities/callOrGet.js', () => ({
  callOrGet: vi.fn((value, _context, ...args) => {
    return typeof value === 'function' ? value(...args) : value;
  }),
}));

import { canJoin, findWrapping } from 'prosemirror-transform';
import { callOrGet } from '../utilities/callOrGet.js';
import { wrappingInputRule } from './wrappingInputRule.js';

describe('wrappingInputRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createHandlerContext = ({ marks = [], storedMarks = null, beforeNode } = {}) => {
    const blockRange = { id: 'range' };
    const resolvedStart = { blockRange: vi.fn(() => blockRange) };
    const resolvedBefore = { nodeBefore: beforeNode };

    const doc = {
      resolve: vi.fn((pos) => {
        if (pos === 10) return resolvedStart;
        return resolvedBefore;
      }),
    };

    const transaction = {
      doc,
      wrap: vi.fn(),
      ensureMarks: vi.fn(),
      join: vi.fn(),
    };

    const deleteSpy = vi.fn(() => transaction);

    const state = {
      tr: { delete: deleteSpy },
      doc: {},
      selection: {
        $to: { parentOffset: 1 },
        $from: { marks: () => marks },
      },
      storedMarks,
    };

    return {
      state,
      blockRange,
      transaction,
      deleteSpy,
      doc,
    };
  };

  it('returns null when no wrapping can be found', () => {
    const { state, blockRange } = createHandlerContext();
    findWrapping.mockReturnValue(null);

    const rule = wrappingInputRule({ match: /^-\s/, type: { name: 'bulletList' } });
    const result = rule.handler({ state, range: { from: 10, to: 12 }, match: ['-'] });

    expect(result).toBeNull();
    expect(findWrapping).toHaveBeenCalledWith(blockRange, { name: 'bulletList' }, {});
  });

  it('wraps content and preserves marks/attributes when enabled', () => {
    const marks = [{ type: { name: 'bold' } }, { type: { name: 'italic' } }];
    const config = {
      match: /^-\s/,
      type: { name: 'bulletList' },
      getAttributes: () => ({ level: 1 }),
      keepMarks: true,
      keepAttributes: true,
      editor: {
        extensionService: {
          splittableMarks: ['bold'],
        },
      },
      joinPredicate: vi.fn(() => true),
    };

    const { state, transaction, blockRange } = createHandlerContext({
      marks,
      beforeNode: { type: config.type },
    });

    findWrapping.mockReturnValue(['wrap-step']);
    canJoin.mockReturnValue(true);

    const runSpy = vi.fn();
    const updateAttributesSpy = vi.fn(() => ({ run: runSpy }));
    const chainMock = vi.fn(() => ({ updateAttributes: updateAttributesSpy }));

    const rule = wrappingInputRule(config);
    rule.handler({ state, range: { from: 10, to: 12 }, match: ['-'], chain: chainMock });

    expect(callOrGet).toHaveBeenCalledWith(config.getAttributes, null, ['-']);
    expect(transaction.wrap).toHaveBeenCalledWith(blockRange, ['wrap-step']);

    expect(transaction.ensureMarks).toHaveBeenCalledWith([marks[0]]);
    expect(updateAttributesSpy).toHaveBeenCalledWith('listItem', { level: 1 });
    expect(runSpy).toHaveBeenCalled();

    expect(config.joinPredicate).toHaveBeenCalledWith(['-'], { type: config.type });
    expect(transaction.join).toHaveBeenCalledWith(9);
  });
});
