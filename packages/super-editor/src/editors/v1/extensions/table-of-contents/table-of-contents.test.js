import { describe, expect, it, vi } from 'vitest';

const { mockGetBlockIndex } = vi.hoisted(() => ({
  mockGetBlockIndex: vi.fn(),
}));

vi.mock('../../document-api-adapters/helpers/index-cache.js', () => ({
  getBlockIndex: (...args) => mockGetBlockIndex(...args),
}));

vi.mock('../../document-api-adapters/helpers/node-address-resolver.js', () => ({
  toBlockAddress: vi.fn((candidate) => ({
    kind: 'block',
    nodeType: candidate.nodeType,
    nodeId: candidate.nodeId,
  })),
}));

const { mockPrepare, mockSync } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockSync: vi.fn(),
}));

vi.mock('../../document-api-adapters/plan-engine/toc-wrappers.js', () => ({
  prepareTableOfContentsInsertion: (...args) => mockPrepare(...args),
}));

vi.mock('../../document-api-adapters/helpers/toc-bookmark-sync.js', () => ({
  syncTocBookmarks: (...args) => mockSync(...args),
}));

vi.mock('@core/Node.js', () => ({
  Node: {
    create: (config) => ({ config }),
  },
}));

vi.mock('@core/Attribute.js', () => ({
  Attribute: {
    mergeAttributes: (...args) => Object.assign({}, ...args),
  },
}));

import { TableOfContents } from './table-of-contents.js';

function createCommandContext() {
  const tocNode = { type: 'tableOfContents-node' };
  const paragraphNode = { type: 'paragraph-node' };
  const textNode = { type: 'text-node' };

  const schema = {
    nodes: {
      tableOfContents: {
        create: vi.fn(() => tocNode),
      },
      paragraph: {
        create: vi.fn(() => paragraphNode),
      },
    },
    text: vi.fn(() => textNode),
  };

  const addCommands = TableOfContents.config.addCommands;
  const commands = addCommands.call({ editor: { schema } });

  return { commands, schema, tocNode };
}

describe('tableOfContents extension commands', () => {
  it('insertTableOfContentsAt returns false when tr.insert throws RangeError', () => {
    const { commands, schema } = createCommandContext();
    const insert = vi.fn(() => {
      throw new RangeError('Position 2 out of range');
    });
    const tr = { insert };
    const dispatch = vi.fn();
    const state = { schema };

    const run = commands.insertTableOfContentsAt({ pos: 2 });
    let result;

    expect(() => {
      result = run({ tr, dispatch, state });
    }).not.toThrow();
    expect(result).toBe(false);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('insertTableOfContentsAt re-throws non-RangeError exceptions', () => {
    const { commands, schema } = createCommandContext();
    const insert = vi.fn(() => {
      throw new TypeError('cannot read property of undefined');
    });
    const tr = { insert };
    const dispatch = vi.fn();
    const state = { schema };

    const run = commands.insertTableOfContentsAt({ pos: 2 });

    expect(() => {
      run({ tr, dispatch, state });
    }).toThrow(TypeError);
  });

  it('insertTableOfContentsAt inserts when the transaction accepts the position', () => {
    const { commands, schema, tocNode } = createCommandContext();
    const insert = vi.fn();
    const tr = { insert };
    const dispatch = vi.fn();
    const state = { schema };

    const run = commands.insertTableOfContentsAt({ pos: 3, instruction: 'TOC \\o "1-3"', sdBlockId: 'toc-1' });
    const result = run({ tr, dispatch, state });

    expect(result).toBe(true);
    expect(insert).toHaveBeenCalledWith(3, tocNode);
  });
});

describe('insertTableOfContentsFromToolbar', () => {
  beforeEach(() => {
    mockGetBlockIndex.mockReset();
    mockPrepare.mockReset();
    mockSync.mockReset();
  });

  it('calls prepare with after-inner anchor and inserts on the command transaction', async () => {
    const { commands, schema, tocNode } = createCommandContext();
    mockPrepare.mockReturnValue({
      pos: 7,
      instruction: 'TOC',
      sdBlockId: 'new-toc',
      content: [],
      sources: [],
    });
    const editor = { schema, state: { selection: { from: 15 } } };
    mockGetBlockIndex.mockReturnValue({
      candidates: [
        { pos: 0, node: { nodeSize: 30 }, nodeType: 'paragraph', nodeId: 'outer' },
        { pos: 10, node: { nodeSize: 10 }, nodeType: 'paragraph', nodeId: 'inner' },
      ],
    });

    const insert = vi.fn();
    const tr = { insert };
    const dispatch = () => {};
    const state = { schema };

    const result = commands.insertTableOfContentsFromToolbar()({ editor, tr, dispatch, state });

    expect(result).toBe(true);
    expect(mockPrepare).toHaveBeenCalledWith(editor, {
      at: { kind: 'after', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'inner' } },
    });
    expect(insert).toHaveBeenCalledWith(7, tocNode);

    await Promise.resolve();
    expect(mockSync).toHaveBeenCalledWith(editor, []);
  });

  it('calls prepare with documentEnd when no block contains the selection anchor', () => {
    const { commands, schema, tocNode } = createCommandContext();
    mockPrepare.mockReturnValue({
      pos: 99,
      instruction: 'TOC',
      sdBlockId: 'x',
      content: [],
      sources: [],
    });
    const editor = { schema, state: { selection: { from: 999 } } };
    mockGetBlockIndex.mockReturnValue({
      candidates: [{ pos: 0, node: { nodeSize: 5 }, nodeType: 'paragraph', nodeId: 'p1' }],
    });

    const insert = vi.fn();
    const tr = { insert };
    const dispatch = () => {};
    const state = { schema };

    expect(commands.insertTableOfContentsFromToolbar()({ editor, tr, dispatch, state })).toBe(true);
    expect(mockPrepare).toHaveBeenCalledWith(editor, { at: { kind: 'documentEnd' } });
    expect(insert).toHaveBeenCalledWith(99, tocNode);
  });

  it('returns false when prepare throws (e.g. tracked mode)', () => {
    const { commands, schema } = createCommandContext();
    mockPrepare.mockImplementation(() => {
      throw new Error('tracked');
    });
    const editor = { schema, state: { selection: { from: 1 } } };
    mockGetBlockIndex.mockReturnValue({ candidates: [] });

    const tr = { insert: vi.fn() };
    const dispatch = () => {};
    const state = { schema };

    expect(commands.insertTableOfContentsFromToolbar()({ editor, tr, dispatch, state })).toBe(false);
  });

  it('does not sync bookmarks during command availability checks without dispatch', async () => {
    const { commands, schema } = createCommandContext();
    mockPrepare.mockReturnValue({
      pos: 7,
      instruction: 'TOC',
      sdBlockId: 'new-toc',
      content: [],
      sources: [{ sdBlockId: 'heading-1' }],
    });
    const editor = { schema, state: { selection: { from: 15 } } };
    mockGetBlockIndex.mockReturnValue({
      candidates: [{ pos: 10, node: { nodeSize: 10 }, nodeType: 'paragraph', nodeId: 'inner' }],
    });

    const tr = { insert: vi.fn() };
    const state = { schema };

    expect(commands.insertTableOfContentsFromToolbar()({ editor, tr, dispatch: undefined, state })).toBe(true);

    await Promise.resolve();
    expect(tr.insert).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });
});
