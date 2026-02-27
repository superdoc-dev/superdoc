import type { Query, QueryResult } from '@superdoc/document-api';
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

function makeResult(result: Partial<QueryResult>): QueryResult {
  return {
    matches: [],
    total: 0,
    ...result,
  };
}

function resolveFindResult(query: Query): QueryResult {
  if (query.select.type === 'text') {
    throw new Error('infoAdapter should only perform node-type queries.');
  }

  switch (query.select.nodeType) {
    case 'paragraph':
      return makeResult({ total: 5 });
    case 'heading':
      return makeResult({
        total: 2,
        matches: [
          { kind: 'block', nodeType: 'heading', nodeId: 'H1' },
          { kind: 'block', nodeType: 'heading', nodeId: 'H2' },
        ],
        nodes: [
          {
            nodeType: 'heading',
            kind: 'block',
            properties: { headingLevel: 2 },
            text: 'Overview',
          },
          {
            nodeType: 'heading',
            kind: 'block',
            properties: { headingLevel: 6 },
            summary: { text: 'Details' },
          },
        ],
      });
    case 'table':
      return makeResult({ total: 1 });
    case 'image':
      return makeResult({ total: 3 });
    case 'comment':
      return makeResult({
        total: 4,
        nodes: [
          {
            nodeType: 'comment',
            kind: 'inline',
            properties: { commentId: 'c-1' },
          },
          {
            nodeType: 'comment',
            kind: 'inline',
            properties: { commentId: 'c-1' },
          },
          {
            nodeType: 'comment',
            kind: 'inline',
            properties: { commentId: 'c-2' },
          },
        ],
      });
    default:
      return makeResult({});
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
      if (query.select.type === 'text') return makeResult({});
      if (query.select.nodeType === 'comment') {
        return makeResult({ total: 7, nodes: [] });
      }
      return makeResult({});
    });

    const result = infoAdapter({} as Editor, {});

    expect(result.counts.comments).toBe(7);
  });
});
