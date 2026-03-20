import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { Editor } from '../../core/Editor.js';

mock.module('./plan-wrappers.js', () => ({
  executeDomainCommand: mock((_editor: Editor, handler: () => boolean) => ({
    steps: [{ effect: handler() ? 'changed' : 'noop' }],
  })),
}));

mock.module('./revision-tracker.js', () => ({
  getRevision: mock(() => 'rev-1'),
}));

mock.module('../helpers/adapter-utils.js', () => ({
  paginate: mock((items: unknown[], offset = 0, limit?: number) => {
    const total = items.length;
    const sliced = items.slice(offset, limit ? offset + limit : undefined);
    return { total, items: sliced };
  }),
  resolveInlineInsertPosition: mock(() => ({ from: 10, to: 10 })),
  resolveBlockCreatePosition: mock(() => 0),
}));

mock.module('../helpers/mutation-helpers.js', () => ({
  rejectTrackedMode: mock(),
}));

mock.module('../helpers/index-cache.js', () => ({
  clearIndexCache: mock(),
}));

mock.module('../helpers/citation-resolver.js', () => ({
  findAllCitations: mock(() => []),
  resolveCitationTarget: mock(),
  extractCitationInfo: mock(),
  buildCitationDiscoveryItem: mock(),
  findAllBibliographies: mock(() => []),
  resolveBibliographyTarget: mock(),
  extractBibliographyInfo: mock(),
  buildBibliographyDiscoveryItem: mock(),
  getSourcesFromConverter: mock(() => []),
  resolveSourceTarget: mock(),
}));

const { citationsInsertWrapper } = await import('./citation-wrappers.js');
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
  sourceIds: string[];
  instruction: string;
}): {
  editor: Editor;
  tr: { insert: ReturnType<typeof mock> };
  dispatch: ReturnType<typeof mock>;
  createCitation: ReturnType<typeof mock>;
} {
  const preferredPos = options.preferredPos ?? 10;
  const blockStart = options.blockStart ?? 1;
  const blockId = options.blockId ?? 'p-citation';

  const insertedNode: MockPmNode = {
    type: { name: 'citation' },
    attrs: {
      instruction: options.instruction,
      sourceIds: options.sourceIds,
      resolvedText: '',
    },
    nodeSize: 1,
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

  const createCitation = mock((attrs: Record<string, unknown>) => ({
    type: { name: 'citation' },
    attrs,
    nodeSize: 1,
  }));

  const dispatch = mock();

  const editor = {
    state: {
      doc,
      tr,
    },
    schema: {
      nodes: {
        citation: { create: createCitation },
      },
    },
    dispatch,
  } as unknown as Editor;

  (resolveInlineInsertPosition as any).mockReturnValueOnce({ from: preferredPos, to: preferredPos });

  return { editor, tr, dispatch, createCitation };
}

beforeEach(() => {});

describe('citationsInsertWrapper', () => {
  it('returns an address for the actual inserted citation position when final position differs from requested position', () => {
    const sourceIds = ['source-1'];
    const instruction = 'CITATION source-1';
    const { editor, tr, dispatch, createCitation } = makeEditor({
      preferredPos: 10,
      insertedPos: 14,
      blockStart: 1,
      blockId: 'p-citations',
      sourceIds,
      instruction,
    });

    const result = citationsInsertWrapper(editor, {
      at: { kind: 'text', segments: [{ blockId: 'p-citations', range: { start: 3, end: 8 } }] },
      sourceIds,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(createCitation).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction,
        sourceIds,
        resolvedText: '',
      }),
    );
    expect(tr.insert).toHaveBeenCalledWith(10, expect.any(Object));
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Insert requested at pos 10, but citation ended up at pos 14; returned address must match pos 14.
    expect(result.citation.anchor.start.blockId).toBe('p-citations');
    expect(result.citation.anchor.start.offset).toBe(13);
    expect(result.citation.anchor.end.offset).toBe(14);
  });
});
