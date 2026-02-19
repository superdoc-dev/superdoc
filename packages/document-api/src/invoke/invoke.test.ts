import { describe, it, expect, vi } from 'vitest';
import { OPERATION_IDS, type OperationId } from '../contract/types.js';
import { createDocumentApi, type DocumentApiAdapters } from '../index.js';
import { buildDispatchTable } from './invoke.js';
import type { FindAdapter } from '../find/find.js';
import type { GetNodeAdapter } from '../get-node/get-node.js';
import type { WriteAdapter } from '../write/write.js';
import type { FormatAdapter } from '../format/format.js';
import type { TrackChangesAdapter } from '../track-changes/track-changes.js';
import type { CreateAdapter } from '../create/create.js';
import type { ListsAdapter } from '../lists/lists.js';
import type { CommentsAdapter } from '../comments/comments.js';
import type { CapabilitiesAdapter, DocumentApiCapabilities } from '../capabilities/capabilities.js';

function makeAdapters() {
  const findAdapter: FindAdapter = { find: vi.fn(() => ({ matches: [], total: 0 })) };
  const getNodeAdapter: GetNodeAdapter = {
    getNode: vi.fn(() => ({ kind: 'block' as const, nodeType: 'paragraph' as const, properties: {} })),
    getNodeById: vi.fn(() => ({ kind: 'block' as const, nodeType: 'paragraph' as const, properties: {} })),
  };
  const getTextAdapter = { getText: vi.fn(() => 'hello') };
  const infoAdapter = {
    info: vi.fn(() => ({
      counts: { words: 1, paragraphs: 1, headings: 0, tables: 0, images: 0, comments: 0 },
      outline: [],
      capabilities: { canFind: true, canGetNode: true, canComment: true, canReplace: true },
    })),
  };
  const capabilitiesAdapter: CapabilitiesAdapter = {
    get: vi.fn(
      (): DocumentApiCapabilities => ({
        global: {
          trackChanges: { enabled: false },
          comments: { enabled: false },
          lists: { enabled: false },
          dryRun: { enabled: false },
        },
        operations: {} as DocumentApiCapabilities['operations'],
      }),
    ),
  };
  const commentsAdapter: CommentsAdapter = {
    add: vi.fn(() => ({ success: true as const })),
    edit: vi.fn(() => ({ success: true as const })),
    reply: vi.fn(() => ({ success: true as const })),
    move: vi.fn(() => ({ success: true as const })),
    resolve: vi.fn(() => ({ success: true as const })),
    remove: vi.fn(() => ({ success: true as const })),
    setInternal: vi.fn(() => ({ success: true as const })),
    setActive: vi.fn(() => ({ success: true as const })),
    goTo: vi.fn(() => ({ success: true as const })),
    get: vi.fn(() => ({
      address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: 'c1' },
      commentId: 'c1',
      status: 'open' as const,
    })),
    list: vi.fn(() => ({ matches: [], total: 0 })),
  };
  const writeAdapter: WriteAdapter = {
    write: vi.fn(() => ({
      success: true as const,
      resolution: {
        target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 0 } },
        range: { from: 1, to: 1 },
        text: '',
      },
    })),
  };
  const formatReceipt = () => ({
    success: true as const,
    resolution: {
      target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 2 } },
      range: { from: 1, to: 3 },
      text: 'Hi',
    },
  });
  const formatAdapter: FormatAdapter = {
    bold: vi.fn(formatReceipt),
    italic: vi.fn(formatReceipt),
    underline: vi.fn(formatReceipt),
    strikethrough: vi.fn(formatReceipt),
  };
  const trackChangesAdapter: TrackChangesAdapter = {
    list: vi.fn(() => ({ matches: [], total: 0 })),
    get: vi.fn((input: { id: string }) => ({
      address: { kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: input.id },
      id: input.id,
      type: 'insert' as const,
    })),
    accept: vi.fn(() => ({ success: true as const })),
    reject: vi.fn(() => ({ success: true as const })),
    acceptAll: vi.fn(() => ({ success: true as const })),
    rejectAll: vi.fn(() => ({ success: true as const })),
  };
  const createAdapter: CreateAdapter = {
    paragraph: vi.fn(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'new-p' },
      insertionPoint: { kind: 'text' as const, blockId: 'new-p', range: { start: 0, end: 0 } },
    })),
    heading: vi.fn(() => ({
      success: true as const,
      heading: { kind: 'block' as const, nodeType: 'heading' as const, nodeId: 'new-h' },
      insertionPoint: { kind: 'text' as const, blockId: 'new-h', range: { start: 0, end: 0 } },
    })),
  };
  const listsAdapter: ListsAdapter = {
    list: vi.fn(() => ({ matches: [], total: 0, items: [] })),
    get: vi.fn(() => ({
      address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    insert: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-2' },
      insertionPoint: { kind: 'text' as const, blockId: 'li-2', range: { start: 0, end: 0 } },
    })),
    setType: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    indent: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    outdent: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    restart: vi.fn(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
    })),
    exit: vi.fn(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p3' },
    })),
  };

  const adapters: DocumentApiAdapters = {
    find: findAdapter,
    getNode: getNodeAdapter,
    getText: getTextAdapter,
    info: infoAdapter,
    capabilities: capabilitiesAdapter,
    comments: commentsAdapter,
    write: writeAdapter,
    format: formatAdapter,
    trackChanges: trackChangesAdapter,
    create: createAdapter,
    lists: listsAdapter,
  };

  return { adapters, findAdapter, writeAdapter, commentsAdapter, trackChangesAdapter };
}

describe('invoke', () => {
  describe('dispatch table completeness', () => {
    it('has an entry for every OperationId', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const dispatchKeys = Object.keys(buildDispatchTable(api)).sort();
      const operationIds = [...OPERATION_IDS].sort();
      expect(dispatchKeys).toEqual(operationIds);
    });

    it('has no extra entries beyond OperationId', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const dispatchKeys = Object.keys(buildDispatchTable(api));
      const operationIdSet = new Set<string>(OPERATION_IDS);
      const extraKeys = dispatchKeys.filter((key) => !operationIdSet.has(key));
      expect(extraKeys).toEqual([]);
    });
  });

  describe('representative parity (invoke matches direct method)', () => {
    it('find: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const query = { nodeType: 'paragraph' as const };
      const direct = api.find(query);
      const invoked = api.invoke({ operationId: 'find', input: query });
      expect(invoked).toEqual(direct);
    });

    it('insert: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { text: 'hello' };
      const direct = api.insert(input);
      const invoked = api.invoke({ operationId: 'insert', input });
      expect(invoked).toEqual(direct);
    });

    it('insert: invoke forwards options through to adapter-backed execution', () => {
      const { adapters, writeAdapter } = makeAdapters();
      const api = createDocumentApi(adapters);
      api.invoke({ operationId: 'insert', input: { text: 'hello' }, options: { changeMode: 'tracked' } });
      expect(writeAdapter.write).toHaveBeenCalledWith(
        { kind: 'insert', text: 'hello' },
        { changeMode: 'tracked', dryRun: false },
      );
    });

    it('comments.add: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = {
        target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'A comment',
      };
      const direct = api.comments.add(input);
      const invoked = api.invoke({ operationId: 'comments.add', input });
      expect(invoked).toEqual(direct);
    });

    it('trackChanges.list: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const direct = api.trackChanges.list();
      const invoked = api.invoke({ operationId: 'trackChanges.list', input: undefined });
      expect(invoked).toEqual(direct);
    });

    it('capabilities.get: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const direct = api.capabilities();
      const invoked = api.invoke({ operationId: 'capabilities.get', input: undefined });
      expect(invoked).toEqual(direct);
    });

    it('lists.get: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' } };
      const direct = api.lists.get(input);
      const invoked = api.invoke({ operationId: 'lists.get', input });
      expect(invoked).toEqual(direct);
    });

    it('format.italic: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 2 } } };
      const direct = api.format.italic(input);
      const invoked = api.invoke({ operationId: 'format.italic', input });
      expect(invoked).toEqual(direct);
    });

    it('format.underline: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 2 } } };
      const direct = api.format.underline(input);
      const invoked = api.invoke({ operationId: 'format.underline', input });
      expect(invoked).toEqual(direct);
    });

    it('format.strikethrough: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 2 } } };
      const direct = api.format.strikethrough(input);
      const invoked = api.invoke({ operationId: 'format.strikethrough', input });
      expect(invoked).toEqual(direct);
    });

    it('create.heading: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { level: 1 as const, at: { kind: 'documentEnd' as const }, text: 'Title' };
      const direct = api.create.heading(input);
      const invoked = api.invoke({ operationId: 'create.heading', input });
      expect(invoked).toEqual(direct);
    });
  });

  describe('error handling', () => {
    it('throws for inherited prototype keys used as operationId', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      expect(() => {
        api.invoke({ operationId: 'toString' as OperationId, input: undefined });
      }).toThrow('Unknown operationId');
    });

    it('throws for unknown operationId with a clear message', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      expect(() => {
        api.invoke({ operationId: 'nonexistent' as OperationId, input: {} });
      }).toThrow('Unknown operationId: "nonexistent"');
    });
  });

  describe('DynamicInvokeRequest (untyped input)', () => {
    it('accepts unknown input and dispatches to the correct handler', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input: unknown = { nodeType: 'paragraph' };
      const result = api.invoke({ operationId: 'find', input });
      expect(result).toEqual({ matches: [], total: 0 });
    });

    it('forwards unknown options through to the handler', () => {
      const { adapters, writeAdapter } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input: unknown = { text: 'dynamic' };
      const options: unknown = { changeMode: 'tracked' };
      api.invoke({ operationId: 'insert', input, options });
      expect(writeAdapter.write).toHaveBeenCalledWith(
        { kind: 'insert', text: 'dynamic' },
        { changeMode: 'tracked', dryRun: false },
      );
    });
  });
});
