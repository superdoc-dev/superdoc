import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Editor } from '../../core/Editor.js';

vi.mock('./plan-wrappers.js', () => ({
  executeDomainCommand: mock((_editor: Editor, handler: () => boolean) => ({
    steps: [{ effect: handler() ? 'changed' : 'noop' }],
  })),
}));

vi.mock('./revision-tracker.js', () => ({
  getRevision: mock(() => 'rev-1'),
}));

vi.mock('../helpers/adapter-utils.js', () => ({
  paginate: mock((items: unknown[], offset = 0, limit?: number) => {
    const total = items.length;
    const sliced = items.slice(offset, limit ? offset + limit : undefined);
    return { total, items: sliced };
  }),
  resolveInlineInsertPosition: mock(() => ({ from: 10, to: 10 })),
  resolveBlockCreatePosition: mock(() => 0),
}));

vi.mock('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: mock(),
}));

vi.mock('../helpers/index-cache.js', () => ({
  clearIndexCache: mock(),
}));

vi.mock('../helpers/index-resolver.js', () => ({
  findAllIndexNodes: mock(() => []),
  resolveIndexTarget: mock(),
  extractIndexInfo: mock(),
  buildIndexDiscoveryItem: mock(),
  findAllIndexEntries: mock(() => []),
  resolveIndexEntryTarget: mock(),
  extractIndexEntryInfo: mock(),
  buildIndexEntryDiscoveryItem: mock(),
  parseIndexInstruction: mock(() => ({})),
}));

const { indexEntriesInsertWrapper } = await import('./index-wrappers.js');
import { resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { resolveIndexEntryTarget } from '../helpers/index-resolver.js';

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
  tr: { insert: ReturnType<typeof mock> };
  dispatch: ReturnType<typeof mock>;
  createIndexEntry: ReturnType<typeof mock>;
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
    nodeAt: mock((pos: number) => (pos === options.insertedPos ? insertedNode : null)),
    resolve: mock((_pos: number) => ({
      depth: 1,
      start: (depth: number) => (depth === 1 ? blockStart : 0),
      node: (depth: number) => (depth === 1 ? { attrs: { sdBlockId: blockId } } : { attrs: {} }),
    })),
    descendants: mock((cb: (node: MockPmNode, pos: number) => boolean | void) => {
      cb(insertedNode, options.insertedPos);
      return true;
    }),
  };

  const tr = {
    insert: mock((_pos: number, _node: unknown) => tr),
  };

  const createIndexEntry = mock((attrs: Record<string, unknown>) => ({
    type: { name: 'indexEntry' },
    attrs,
    nodeSize: 2,
  }));

  const dispatch = mock();

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

  (resolveInlineInsertPosition as any).mockReturnValueOnce({ from: preferredPos, to: preferredPos });

  return { editor, tr, dispatch, createIndexEntry };
}

beforeEach(() => {});

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

describe('indexEntriesUpdateWrapper', () => {
  it('rebuilds the XE instruction when patch.text changes the primary entry text', async () => {
    const { indexEntriesUpdateWrapper } = await import('./index-wrappers.js');

    const resolvedNode = {
      attrs: {
        instruction: 'XE "Primary Entry:Sub Entry"',
        instructionTokens: null,
        subEntry: 'Sub Entry',
        bold: false,
        italic: false,
      },
      nodeSize: 2,
    };

    const tr = {
      setNodeMarkup: mock((_pos: number, _type: unknown, _attrs: Record<string, unknown>) => tr),
    };

    const editor = {
      state: {
        doc: {},
        tr,
      },
      dispatch: mock(),
    } as unknown as Editor;

    (resolveIndexEntryTarget as any).mockReturnValueOnce({
      pos: 7,
      node: resolvedNode as never,
      instruction: 'XE "Primary Entry:Sub Entry"',
      blockId: 'p-index',
    });

    const { extractIndexEntryInfo } = await import('../helpers/index-resolver.js');
    (extractIndexEntryInfo as any).mockReturnValueOnce({
      address: {
        kind: 'inline',
        nodeType: 'indexEntry',
        anchor: {
          start: { blockId: 'p-index', offset: 6 },
          end: { blockId: 'p-index', offset: 8 },
        },
      },
      instruction: 'XE "Primary Entry:Sub Entry"',
      text: 'Primary Entry',
      subEntry: 'Sub Entry',
      bold: false,
      italic: false,
    });

    const result = indexEntriesUpdateWrapper(editor, {
      target: {
        kind: 'inline',
        nodeType: 'indexEntry',
        anchor: {
          start: { blockId: 'p-index', offset: 6 },
          end: { blockId: 'p-index', offset: 8 },
        },
      },
      patch: {
        text: 'Updated Entry',
      },
    });

    expect(result.success).toBe(true);
    expect(tr.setNodeMarkup).toHaveBeenCalledWith(
      7,
      undefined,
      expect.objectContaining({
        text: 'Updated Entry',
        instruction: 'XE "Updated Entry:Sub Entry"',
        instructionTokens: null,
      }),
    );
  });
});
