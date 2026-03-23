import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../../core/Editor.js';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'bib-runtime'),
}));

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

vi.mock('../helpers/citation-resolver.js', () => ({
  findAllCitations: vi.fn(() => []),
  resolveCitationTarget: vi.fn(),
  extractCitationInfo: vi.fn(),
  buildCitationDiscoveryItem: vi.fn(),
  findAllBibliographies: vi.fn(() => []),
  resolveBibliographyTarget: vi.fn(),
  resolvePostMutationBibliographyId: vi.fn((_doc, sdBlockId: string) => sdBlockId),
  extractBibliographyInfo: vi.fn(),
  buildBibliographyDiscoveryItem: vi.fn(),
  getSourcesFromConverter: vi.fn(() => []),
  resolveSourceTarget: vi.fn(),
  syncBibliographyStyleToConverter: vi.fn(),
}));

import { citationsInsertWrapper } from './citation-wrappers.js';
import { resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { resolvePostMutationBibliographyId } from '../helpers/citation-resolver.js';

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
  tr: { insert: ReturnType<typeof vi.fn> };
  dispatch: ReturnType<typeof vi.fn>;
  createCitation: ReturnType<typeof vi.fn>;
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

  const createCitation = vi.fn((attrs: Record<string, unknown>) => ({
    type: { name: 'citation' },
    attrs,
    nodeSize: 1,
  }));

  const dispatch = vi.fn();

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

  vi.mocked(resolveInlineInsertPosition).mockReturnValueOnce({ from: preferredPos, to: preferredPos });

  return { editor, tr, dispatch, createCitation };
}

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe('bibliographyInsertWrapper', () => {
  it('forwards style into bibliography node attrs and returns the resolved node id', async () => {
    const { bibliographyInsertWrapper } = await import('./citation-wrappers.js');

    vi.mocked(resolvePostMutationBibliographyId).mockReturnValueOnce('bib-runtime');

    const tr = {
      insert: vi.fn((_pos: number, _node: unknown) => tr),
    };

    const createBibliography = vi.fn((attrs: Record<string, unknown>) => ({
      type: { name: 'bibliography' },
      attrs,
      nodeSize: 2,
    }));

    const editor = {
      state: {
        doc: {},
        tr,
      },
      schema: {
        nodes: {
          bibliography: { create: createBibliography },
          paragraph: { create: vi.fn(() => ({ type: { name: 'paragraph' }, nodeSize: 2 })) },
        },
      },
      dispatch: vi.fn(),
    } as unknown as Editor;

    const result = bibliographyInsertWrapper(
      editor,
      {
        at: { kind: 'documentEnd' },
        style: 'APA',
      },
      { changeMode: 'direct' } as never,
    );

    expect(result).toEqual({
      success: true,
      bibliography: { kind: 'block', nodeType: 'bibliography', nodeId: 'bib-runtime' },
    });
    expect(createBibliography).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: 'BIBLIOGRAPHY',
        sdBlockId: 'bib-runtime',
        style: 'APA',
      }),
      expect.anything(),
    );
  });
});
