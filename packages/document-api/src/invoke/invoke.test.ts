import { describe, it, expect, mock } from 'bun:test';
import { OPERATION_IDS, type OperationId } from '../contract/types.js';
import { createDocumentApi, type DocumentApiAdapters } from '../index.js';
import { buildDispatchTable } from './invoke.js';
import type { FindAdapter } from '../find/find.js';
import type { GetNodeAdapter } from '../get-node/get-node.js';
import type { WriteAdapter } from '../write/write.js';
import type { SelectionMutationAdapter } from '../selection-mutation.js';
import type { StylesAdapter } from '../styles/index.js';
import type { TrackChangesAdapter } from '../track-changes/track-changes.js';
import type { CreateAdapter } from '../create/create.js';
import type { ListsAdapter } from '../lists/lists.js';
import type { CommentsAdapter } from '../comments/comments.js';
import type { CapabilitiesAdapter, DocumentApiCapabilities } from '../capabilities/capabilities.js';

function makeAdapters() {
  const findAdapter: FindAdapter = {
    find: mock(() => ({ evaluatedRevision: '', total: 0, items: [], page: { limit: 50, offset: 0, returned: 0 } })),
  };
  const getNodeAdapter: GetNodeAdapter = {
    getNode: mock(() => ({ kind: 'block' as const, nodeType: 'paragraph' as const, properties: {} })),
    getNodeById: mock(() => ({ kind: 'block' as const, nodeType: 'paragraph' as const, properties: {} })),
  };
  const getTextAdapter = { getText: mock(() => 'hello') };
  const infoAdapter = {
    info: mock(() => ({
      counts: {
        words: 1,
        characters: 5,
        paragraphs: 1,
        headings: 0,
        tables: 0,
        images: 0,
        comments: 0,
        trackedChanges: 0,
        sdtFields: 0,
        lists: 1,
      },
      outline: [],
      capabilities: { canFind: true, canGetNode: true, canComment: true, canReplace: true },
      revision: '0',
    })),
  };
  const capabilitiesAdapter: CapabilitiesAdapter = {
    get: mock(
      (): DocumentApiCapabilities => ({
        global: {
          trackChanges: { enabled: false },
          comments: { enabled: false },
          lists: { enabled: false },
          dryRun: { enabled: false },
        },
        format: { supportedInlineProperties: {} as DocumentApiCapabilities['format']['supportedInlineProperties'] },
        operations: {} as DocumentApiCapabilities['operations'],
        planEngine: {
          supportedStepOps: [],
          supportedNonUniformStrategies: [],
          supportedSetMarks: [],
          regex: { maxPatternLength: 1024, maxExecutionMs: 100 },
        },
      }),
    ),
  };
  const commentsAdapter: CommentsAdapter = {
    add: mock(() => ({ success: true as const })),
    edit: mock(() => ({ success: true as const })),
    reply: mock(() => ({ success: true as const })),
    move: mock(() => ({ success: true as const })),
    resolve: mock(() => ({ success: true as const })),
    remove: mock(() => ({ success: true as const })),
    setInternal: mock(() => ({ success: true as const })),
    setActive: mock(() => ({ success: true as const })),
    goTo: mock(() => ({ success: true as const })),
    get: mock(() => ({
      address: { kind: 'entity' as const, entityType: 'comment' as const, entityId: 'c1' },
      commentId: 'c1',
      status: 'open' as const,
    })),
    list: mock(() => ({ evaluatedRevision: '', total: 0, items: [], page: { limit: 50, offset: 0, returned: 0 } })),
  };
  const writeAdapter: WriteAdapter = {
    write: mock(() => ({
      success: true as const,
      resolution: {
        target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 0 } },
        range: { from: 1, to: 1 },
        text: '',
      },
    })),
    insertStructured: mock(() => ({
      success: true as const,
      resolution: {
        target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 0 } },
        range: { from: 1, to: 1 },
        text: '',
      },
    })),
  };
  const selectionMutationReceipt = () => ({
    success: true as const,
    resolution: {
      blockId: 'p1',
      blockType: 'paragraph' as const,
      text: 'Hi',
      target: {
        kind: 'selection' as const,
        start: { kind: 'text' as const, blockId: 'p1', offset: 0 },
        end: { kind: 'text' as const, blockId: 'p1', offset: 2 },
      },
      range: { start: 0, end: 2 },
    },
  });
  const selectionMutationAdapter: SelectionMutationAdapter = {
    execute: mock(selectionMutationReceipt),
  };
  const stylesAdapter: StylesAdapter = {
    apply: mock(() => ({
      success: true as const,
      changed: true,
      resolution: {
        scope: 'docDefaults' as const,
        channel: 'run' as const,
        xmlPart: 'word/styles.xml' as const,
        xmlPath: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr' as const,
      },
      dryRun: false,
      before: { bold: 'inherit' as const },
      after: { bold: 'on' as const },
    })),
  };
  const trackChangesAdapter: TrackChangesAdapter = {
    list: mock(() => ({ evaluatedRevision: '', total: 0, items: [], page: { limit: 50, offset: 0, returned: 0 } })),
    get: mock((input: { id: string }) => ({
      address: { kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: input.id },
      id: input.id,
      type: 'insert' as const,
    })),
    accept: mock(() => ({ success: true as const })),
    reject: mock(() => ({ success: true as const })),
    acceptAll: mock(() => ({ success: true as const })),
    rejectAll: mock(() => ({ success: true as const })),
  };
  const createAdapter: CreateAdapter = {
    paragraph: mock(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'new-p' },
      insertionPoint: { kind: 'text' as const, blockId: 'new-p', range: { start: 0, end: 0 } },
    })),
    heading: mock(() => ({
      success: true as const,
      heading: { kind: 'block' as const, nodeType: 'heading' as const, nodeId: 'new-h' },
      insertionPoint: { kind: 'text' as const, blockId: 'new-h', range: { start: 0, end: 0 } },
    })),
  };
  const listsMutateResult = () => ({
    success: true as const,
    item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
  });
  const listsAdapter: ListsAdapter = {
    list: mock(() => ({ evaluatedRevision: '', total: 0, items: [], page: { limit: 50, offset: 0, returned: 0 } })),
    get: mock(() => ({
      address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
      listId: 'list-1',
    })),
    insert: mock(() => ({
      success: true as const,
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-2' },
      insertionPoint: { kind: 'text' as const, blockId: 'li-2', range: { start: 0, end: 0 } },
    })),
    indent: mock(listsMutateResult),
    outdent: mock(listsMutateResult),
    create: mock(() => ({
      success: true as const,
      listId: 'list-new',
      item: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-new' },
    })),
    attach: mock(listsMutateResult),
    detach: mock(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p3' },
    })),
    join: mock(() => ({ success: true as const, listId: 'list-1' })),
    canJoin: mock(() => ({ canJoin: true })),
    separate: mock(() => ({ success: true as const, listId: 'list-new', numId: 2 })),
    setLevel: mock(listsMutateResult),
    setValue: mock(listsMutateResult),
    continuePrevious: mock(listsMutateResult),
    canContinuePrevious: mock(() => ({ canContinue: true })),
    setLevelRestart: mock(listsMutateResult),
    convertToText: mock(() => ({
      success: true as const,
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p3' },
    })),
    applyTemplate: mock(listsMutateResult),
    applyPreset: mock(listsMutateResult),
    captureTemplate: mock(() => ({
      success: true as const,
      template: { version: 1, levels: [] },
    })),
    setLevelNumbering: mock(listsMutateResult),
    setLevelBullet: mock(listsMutateResult),
    setLevelPictureBullet: mock(listsMutateResult),
    setLevelAlignment: mock(listsMutateResult),
    setLevelIndents: mock(listsMutateResult),
    setLevelTrailingCharacter: mock(listsMutateResult),
    setLevelMarkerFont: mock(listsMutateResult),
    clearLevelOverrides: mock(listsMutateResult),
  };

  const queryAdapter = {
    match: mock(() => ({ evaluatedRevision: 'r1', total: 0, items: [], page: { limit: 0, offset: 0, returned: 0 } })),
  };
  const mutationsAdapter = {
    preview: mock(() => ({ evaluatedRevision: 'r1', steps: [], valid: true })),
    apply: mock(() => ({
      success: true as const,
      revision: { before: 'r1', after: 'r2' },
      steps: [],
      trackedChanges: [],
      timing: { totalMs: 0 },
    })),
  };

  const headerFootersAdapter = {
    list: mock(() => ({ evaluatedRevision: '', total: 0, items: [], page: { limit: 250, offset: 0, returned: 0 } })),
    get: mock(() => ({
      section: { kind: 'section' as const, sectionId: 's0' },
      sectionIndex: 0,
      kind: 'header' as const,
      variant: 'default' as const,
      refId: null,
      isExplicit: false,
    })),
    resolve: mock(() => ({ status: 'none' as const })),
    refs: {
      set: mock(() => ({ success: true as const, section: { kind: 'section' as const, sectionId: 's0' } })),
      clear: mock(() => ({ success: true as const, section: { kind: 'section' as const, sectionId: 's0' } })),
      setLinkedToPrevious: mock(() => ({
        success: true as const,
        section: { kind: 'section' as const, sectionId: 's0' },
      })),
    },
    parts: {
      list: mock(() => ({ evaluatedRevision: '', total: 0, items: [], page: { limit: 250, offset: 0, returned: 0 } })),
      create: mock(() => ({ success: true as const, refId: 'rId99', partPath: 'word/header99.xml' })),
      delete: mock(() => ({ success: true as const, refId: 'rId99', partPath: 'word/header99.xml' })),
    },
  };

  const adapters: DocumentApiAdapters = {
    find: findAdapter,
    getNode: getNodeAdapter,
    getText: getTextAdapter,
    info: infoAdapter,
    capabilities: capabilitiesAdapter,
    comments: commentsAdapter,
    write: writeAdapter,
    selectionMutation: selectionMutationAdapter,
    styles: stylesAdapter,
    trackChanges: trackChangesAdapter,
    create: createAdapter,
    lists: listsAdapter,
    headerFooters: headerFootersAdapter,
    query: queryAdapter,
    mutations: mutationsAdapter,
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
      const input = { value: 'hello' };
      const direct = api.insert(input);
      const invoked = api.invoke({ operationId: 'insert', input });
      expect(invoked).toEqual(direct);
    });

    it('insert: invoke forwards options through to adapter-backed execution', () => {
      const { adapters, writeAdapter } = makeAdapters();
      const api = createDocumentApi(adapters);
      api.invoke({ operationId: 'insert', input: { value: 'hello' }, options: { changeMode: 'tracked' } });
      expect(writeAdapter.write).toHaveBeenCalledWith(
        { kind: 'insert', text: 'hello' },
        { changeMode: 'tracked', dryRun: false },
      );
    });

    it('comments.create: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = {
        target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'A comment',
      };
      const direct = api.comments.create(input);
      const invoked = api.invoke({ operationId: 'comments.create', input });
      expect(invoked).toEqual(direct);
    });

    it('trackChanges.list: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const direct = api.trackChanges.list();
      const invoked = api.invoke({ operationId: 'trackChanges.list', input: undefined });
      expect(invoked).toEqual(direct);
    });

    it('trackChanges.decide: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = { decision: 'accept' as const, target: { id: 'tc-1' } };
      const direct = api.trackChanges.decide(input);
      const invoked = api.invoke({ operationId: 'trackChanges.decide', input });
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

    it('format.apply: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = {
        target: {
          kind: 'selection' as const,
          start: { kind: 'text' as const, blockId: 'p1', offset: 0 },
          end: { kind: 'text' as const, blockId: 'p1', offset: 2 },
        },
        inline: { bold: true },
      };
      const direct = api.format.apply(input);
      const invoked = api.invoke({ operationId: 'format.apply', input });
      expect(invoked).toEqual(direct);
    });

    it('format.fontFamily: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = {
        target: {
          kind: 'selection' as const,
          start: { kind: 'text' as const, blockId: 'p1', offset: 0 },
          end: { kind: 'text' as const, blockId: 'p1', offset: 2 },
        },
        value: 'Arial',
      };
      const direct = api.format.fontFamily(input);
      const invoked = api.invoke({ operationId: 'format.fontFamily', input });
      expect(invoked).toEqual(direct);
    });

    it('styles.apply: invoke returns same result as direct call', () => {
      const { adapters } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input = {
        target: { scope: 'docDefaults' as const, channel: 'run' as const },
        patch: { bold: true },
      };
      const direct = api.styles.apply(input);
      const invoked = api.invoke({ operationId: 'styles.apply', input });
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
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total', 0);
      expect(result).toHaveProperty('evaluatedRevision');
      expect(result).toHaveProperty('page');
    });

    it('forwards unknown options through to the handler', () => {
      const { adapters, writeAdapter } = makeAdapters();
      const api = createDocumentApi(adapters);
      const input: unknown = { value: 'dynamic' };
      const options: unknown = { changeMode: 'tracked' };
      api.invoke({ operationId: 'insert', input, options });
      expect(writeAdapter.write).toHaveBeenCalledWith(
        { kind: 'insert', text: 'dynamic' },
        { changeMode: 'tracked', dryRun: false },
      );
    });
  });
});
