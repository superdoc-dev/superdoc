import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
mock.module('prosemirror-transform', () => ({
  canJoin: mock(),
  findWrapping: mock(),
}));

mock.module('../InputRule.js', () => {
  return {
    InputRule: class {
      constructor(config) {
        this.match = config.match;
        this.handler = config.handler;
      }
    },
  };
});

mock.module('../utilities/callOrGet.js', () => ({
  callOrGet: mock((value, _context, ...args) => {
    return typeof value === 'function' ? value(...args) : value;
  }),
}));

import { canJoin, findWrapping } from 'prosemirror-transform';
import { callOrGet } from '../utilities/callOrGet.js';
const { wrappingInputRule } = await import('./wrappingInputRule.js');

describe('wrappingInputRule', () => {
  beforeEach(() => {});

  afterEach(() => {});

  const createHandlerContext = ({ marks = [], storedMarks = null, beforeNode } = {}) => {
    const blockRange = { id: 'range' };
    const resolvedStart = { blockRange: mock(() => blockRange) };
    const resolvedBefore = { nodeBefore: beforeNode };

    const doc = {
      resolve: mock((pos) => {
        if (pos === 10) return resolvedStart;
        return resolvedBefore;
      }),
    };

    const transaction = {
      doc,
      wrap: mock(),
      ensureMarks: mock(),
      join: mock(),
    };

    const deleteSpy = mock(() => transaction);

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
      joinPredicate: mock(() => true),
    };

    const { state, transaction, blockRange } = createHandlerContext({
      marks,
      beforeNode: { type: config.type },
    });

    findWrapping.mockReturnValue(['wrap-step']);
    canJoin.mockReturnValue(true);

    const runSpy = mock();
    const updateAttributesSpy = mock(() => ({ run: runSpy }));
    const chainMock = mock(() => ({ updateAttributes: updateAttributesSpy }));

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
