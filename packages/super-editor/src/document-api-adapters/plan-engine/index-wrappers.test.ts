import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: vi.fn((_editor: Editor, handler: () => boolean) => ({
    steps: [{ effect: handler() ? 'changed' : 'noop' }],
  })),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: vi.fn(() => 'rev-1'),
}));

vi.mock('../helpers/adapter-utils.js', () => ({
  paginate: vi.fn((items: unknown[], offset = 0, limit?: number) => {
    const total = items.length;
    const sliced = items.slice(offset, limit ? offset + limit : undefined);
    return { total, items: sliced };
  }),
  resolveInlineInsertPosition: vi.fn(() => ({ from: 10, to: 10 })),
  resolveBlockCreatePosition: vi.fn(() => 0),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: vi.fn(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  clearIndexCache: vi.fn(),
}));

vi.mock('../helpers/index-resolver.js', () => ({
  findAllIndexNodes: vi.fn(() => []),
  resolveIndexTarget: vi.fn(),
  extractIndexInfo: vi.fn(),
  buildIndexDiscoveryItem: vi.fn(),
  findAllIndexEntries: vi.fn(() => []),
  resolveIndexEntryTarget: vi.fn(),
  extractIndexEntryInfo: vi.fn(),
  buildIndexEntryDiscoveryItem: vi.fn(),
  parseIndexInstruction: vi.fn(() => ({})),
}));

import { indexEntriesInsertWrapper } from './index-wrappers.js';
import { resolveInlineInsertPosition } from '../helpers/adapter-utils.js';

type MockPmNode = {
  type: { name: string };
  attrs?: Record<string, unknown>;
  nodeSize?: number;
};

function makeEditor(options: {
  insertedPos: number;
  preferredPos?: number;
  blockStart?: number;
  blockId?: string;
  instruction: string;
}): {
  editor: Editor;
  tr: { insert: ReturnType<typeof vi.fn> };
  dispatch: ReturnType<typeof vi.fn>;
  createIndexEntry: ReturnType<typeof vi.fn>;
} {
  const preferredPos = options.preferredPos ?? 10;
  const blockStart = options.blockStart ?? 1;
  const blockId = options.blockId ?? 'p-index';

  const insertedNode: MockPmNode = {
    type: { name: 'indexEntry' },
    attrs: { instruction: options.instruction },
    nodeSize: 2,
  };

  const doc = {
    nodeAt: vi.fn((pos: number) => (pos === options.insertedPos ? insertedNode : null)),
    resolve: vi.fn((_pos: number) => ({
      depth: 1,
      start: (depth: number) => (depth === 1 ? blockStart : 0),
      node: (depth: number) => (depth === 1 ? { attrs: { sdBlockId: blockId } } : { attrs: {} }),
    })),
    descendants: vi.fn((cb: (node: MockPmNode, pos: number) => boolean | void) => {
      cb(insertedNode, options.insertedPos);
      return true;
    }),
  };

  const tr = {
    insert: vi.fn((_pos: number, _node: unknown) => tr),
  };

  const createIndexEntry = vi.fn((attrs: Record<string, unknown>) => ({
    type: { name: 'indexEntry' },
    attrs,
    nodeSize: 2,
  }));

  const dispatch = vi.fn();

  const editor = {
    state: {
      doc,
      tr,
    },
    schema: {
      nodes: {
        indexEntry: { create: createIndexEntry },
      },
    },
    dispatch,
  } as unknown as Editor;

  vi.mocked(resolveInlineInsertPosition).mockReturnValueOnce({ from: preferredPos, to: preferredPos });

  return { editor, tr, dispatch, createIndexEntry };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('indexEntriesInsertWrapper', () => {
  it('returns an address for the actual inserted indexEntry position when final position differs from requested position', () => {
    const instruction = 'XE "Alpha Entry:Primary" \\b';
    const { editor, tr, dispatch, createIndexEntry } = makeEditor({
      preferredPos: 10,
      insertedPos: 12,
      blockStart: 1,
      blockId: 'p-alpha',
      instruction,
    });

    const result = indexEntriesInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p-alpha', range: { start: 3, end: 8 } }] },
      entry: {
        text: 'Alpha Entry',
        subEntry: 'Primary',
        bold: true,
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(createIndexEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction,
        instructionTokens: null,
      }),
    );
    expect(tr.insert).toHaveBeenCalledWith(10, expect.any(Object));
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Insert requested at pos 10, but entry ended up at pos 12; returned address must match pos 12.
    expect(result.entry.anchor.start.blockId).toBe('p-alpha');
    expect(result.entry.anchor.start.offset).toBe(11);
    expect(result.entry.anchor.end.offset).toBe(13);
  });
});
