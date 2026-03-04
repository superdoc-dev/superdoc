import type { Query, FindOutput, FindItemDomain } from '@superdoc/document-api';
import { buildResolvedHandle, buildDiscoveryItem, buildDiscoveryResult } from '@superdoc/document-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '../core/Editor.js';
import { findAdapter } from './find-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';
import { infoAdapter } from './info-adapter.js';

vi.mock('./find-adapter.js', () => ({
  findAdapter: vi.fn(),
}));

vi.mock('./get-text-adapter.js', () => ({
  getTextAdapter: vi.fn(),
}));

const findAdapterMock = vi.mocked(findAdapter);
const getTextAdapterMock = vi.mocked(getTextAdapter);

function makeFindOutput(
  overrides: {
    total?: number;
    items?: Array<{
      address: FindItemDomain['address'];
      node?: FindItemDomain['node'];
      context?: FindItemDomain['context'];
    }>;
  } = {},
): FindOutput {
  const items = (overrides.items ?? []).map((item, idx) => {
    const nodeId = 'nodeId' in item.address ? (item.address as { nodeId: string }).nodeId : `find:${idx}`;
    const handle = buildResolvedHandle(nodeId, 'ephemeral', 'node');
    return buildDiscoveryItem(nodeId, handle, item);
  });
  const total = overrides.total ?? items.length;
  return {
    ...buildDiscoveryResult({
      evaluatedRevision: '',
      total,
      items,
      page: { limit: total, offset: 0, returned: items.length },
    }),
  };
}

function resolveFindResult(query: Query): FindOutput {
  if (query.select.type === 'text') {
    throw new Error('infoAdapter should only perform node-type queries.');
  }

  switch (query.select.nodeType) {
    case 'paragraph':
      return makeFindOutput({ total: 5 });
    case 'heading':
      return makeFindOutput({
        total: 2,
        items: [
          {
            address: { kind: 'block', nodeType: 'heading', nodeId: 'H1' },
            node: {
              nodeType: 'heading',
              kind: 'block',
              properties: { headingLevel: 2 },
              text: 'Overview',
            },
          },
          {
            address: { kind: 'block', nodeType: 'heading', nodeId: 'H2' },
            node: {
              nodeType: 'heading',
              kind: 'block',
              properties: { headingLevel: 6 },
              summary: { text: 'Details' },
            },
          },
        ],
      });
    case 'table':
      return makeFindOutput({ total: 1 });
    case 'image':
      return makeFindOutput({ total: 3 });
    case 'comment':
      return makeFindOutput({
        total: 4,
        items: [
          {
            address: {
              kind: 'inline',
              nodeType: 'comment',
              anchor: { start: { blockId: 'p1', offset: 0 }, end: { blockId: 'p1', offset: 1 } },
            },
            node: { nodeType: 'comment', kind: 'inline', properties: { commentId: 'c-1' } },
          },
          {
            address: {
              kind: 'inline',
              nodeType: 'comment',
              anchor: { start: { blockId: 'p1', offset: 2 }, end: { blockId: 'p1', offset: 3 } },
            },
            node: { nodeType: 'comment', kind: 'inline', properties: { commentId: 'c-1' } },
          },
          {
            address: {
              kind: 'inline',
              nodeType: 'comment',
              anchor: { start: { blockId: 'p1', offset: 4 }, end: { blockId: 'p1', offset: 5 } },
            },
            node: { nodeType: 'comment', kind: 'inline', properties: { commentId: 'c-2' } },
          },
        ],
      });
    default:
      return makeFindOutput({});
  }
}

describe('infoAdapter', () => {
  beforeEach(() => {
    findAdapterMock.mockReset();
    getTextAdapterMock.mockReset();
  });

  it('computes counts and outline from find/get-text adapters', () => {
    getTextAdapterMock.mockReturnValue('hello world from info adapter');
    findAdapterMock.mockImplementation((editor: Editor, query: Query) => resolveFindResult(query));

    const result = infoAdapter({} as Editor, {});

    expect(result.counts).toEqual({
      words: 5,
      paragraphs: 5,
      headings: 2,
      tables: 1,
      images: 3,
      comments: 2,
    });
    expect(result.outline).toEqual([
      { level: 2, text: 'Overview', nodeId: 'H1' },
      { level: 6, text: 'Details', nodeId: 'H2' },
    ]);
    expect(result.capabilities).toEqual({
      canFind: true,
      canGetNode: true,
      canComment: true,
      canReplace: true,
    });
  });

  it('falls back to total comment count when includeNodes does not return comment nodes', () => {
    getTextAdapterMock.mockReturnValue('');
    findAdapterMock.mockImplementation((editor: Editor, query: Query) => {
      if (query.select.type === 'text') return makeFindOutput({});
      if (query.select.nodeType === 'comment') {
        return makeFindOutput({ total: 7 });
      }
      return makeFindOutput({});
    });

    const result = infoAdapter({} as Editor, {});

    expect(result.counts.comments).toBe(7);
  });
});
