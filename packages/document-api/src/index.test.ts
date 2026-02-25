import type { DocumentInfo, FindOutput, NodeAddress, NodeInfo, Query } from './types/index.js';
import type {
  CommentsAdapter,
  CommentsCreateInput,
  CommentsPatchInput,
  CommentsDeleteInput,
  GetCommentInput,
} from './comments/comments.js';
import type { FormatAdapter } from './format/format.js';
import type { FindAdapter } from './find/find.js';
import type { GetNodeAdapter } from './get-node/get-node.js';
import type { TrackChangesAdapter } from './track-changes/track-changes.js';
import type { WriteAdapter } from './write/write.js';
import { createDocumentApi } from './index.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments/comments.types.js';
import type { CreateAdapter } from './create/create.js';
import type { ListsAdapter } from './lists/lists.js';
import type { CapabilitiesAdapter, DocumentApiCapabilities } from './capabilities/capabilities.js';

function makeFindAdapter(result: FindOutput): FindAdapter {
  return { find: vi.fn(() => result) };
}

function makeGetNodeAdapter(info: NodeInfo): GetNodeAdapter {
  return {
    getNode: vi.fn(() => info),
    getNodeById: vi.fn((_input) => info),
  };
}

function makeGetTextAdapter(text = '') {
  return {
    getText: vi.fn((_input) => text),
  };
}

function makeInfoAdapter(result?: Partial<DocumentInfo>) {
  const defaultResult: DocumentInfo = {
    counts: {
      words: 0,
      paragraphs: 0,
      headings: 0,
      tables: 0,
      images: 0,
      comments: 0,
    },
    outline: [],
    capabilities: {
      canFind: true,
      canGetNode: true,
      canComment: true,
      canReplace: true,
    },
  };

  return {
    info: vi.fn((_input) => ({
      ...defaultResult,
      ...result,
      counts: {
        ...defaultResult.counts,
        ...(result?.counts ?? {}),
      },
      capabilities: {
        ...defaultResult.capabilities,
        ...(result?.capabilities ?? {}),
      },
      outline: result?.outline ?? defaultResult.outline,
    })),
  };
}

function makeCommentsAdapter(): CommentsAdapter {
  return {
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
    list: vi.fn(() => ({ evaluatedRevision: 'r1', total: 0, items: [], page: { limit: 0, offset: 0, returned: 0 } })),
  };
}

function makeWriteAdapter(): WriteAdapter {
  return {
    write: vi.fn(() => ({
      success: true as const,
      resolution: {
        target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 0 } },
        range: { from: 1, to: 1 },
        text: '',
      },
    })),
  };
}

function makeFormatReceipt() {
  return {
    success: true as const,
    resolution: {
      target: { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 2 } },
      range: { from: 1, to: 3 },
      text: 'Hi',
    },
  };
}

function makeFormatAdapter(): FormatAdapter {
  return {
    apply: vi.fn(() => makeFormatReceipt()),
  };
}

function makeTrackChangesAdapter(): TrackChangesAdapter {
  return {
    list: vi.fn((_input) => ({
      evaluatedRevision: 'r1',
      total: 0,
      items: [],
      page: { limit: 0, offset: 0, returned: 0 },
    })),
    get: vi.fn((input: { id: string }) => ({
      address: { kind: 'entity' as const, entityType: 'trackedChange' as const, entityId: input.id },
      id: input.id,
      type: 'insert' as const,
    })),
    accept: vi.fn((_input) => ({ success: true as const })),
    reject: vi.fn((_input) => ({ success: true as const })),
    acceptAll: vi.fn((_input) => ({ success: true as const })),
    rejectAll: vi.fn((_input) => ({ success: true as const })),
  };
}

function makeCreateAdapter(): CreateAdapter {
  return {
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
}

function makeListsAdapter(): ListsAdapter {
  return {
    list: vi.fn(() => ({ evaluatedRevision: 'r1', total: 0, items: [], page: { limit: 0, offset: 0, returned: 0 } })),
    get: vi.fn(() => ({
      address: { kind: 'block' as const, nodeType: 'listItem' as const, nodeId: 'li-1' },
      kind: 'ordered' as const,
      level: 0,
      text: 'List item',
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
      paragraph: { kind: 'block' as const, nodeType: 'paragraph' as const, nodeId: 'p1' },
    })),
  };
}

function makeCapabilitiesAdapter(overrides?: Partial<DocumentApiCapabilities>): CapabilitiesAdapter {
  const defaultCapabilities: DocumentApiCapabilities = {
    global: {
      trackChanges: { enabled: false },
      comments: { enabled: false },
      lists: { enabled: false },
      dryRun: { enabled: false },
    },
    format: { supportedMarks: [] },
    operations: {} as DocumentApiCapabilities['operations'],
    planEngine: {
      supportedStepOps: [],
      supportedNonUniformStrategies: [],
      supportedSetMarks: [],
      regex: { maxPatternLength: 1024, maxExecutionMs: 100 },
    },
  };
  return {
    get: vi.fn(() => ({ ...defaultCapabilities, ...overrides })),
  };
}

const PARAGRAPH_ADDRESS: NodeAddress = { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' };

const PARAGRAPH_INFO: NodeInfo = {
  nodeType: 'paragraph',
  kind: 'block',
  properties: {},
};

const QUERY_RESULT: FindOutput = {
  evaluatedRevision: '',
  total: 1,
  items: [
    {
      id: PARAGRAPH_ADDRESS.nodeId,
      handle: { ref: PARAGRAPH_ADDRESS.nodeId, refStability: 'ephemeral' as const, targetKind: 'node' as const },
      address: PARAGRAPH_ADDRESS,
    },
  ],
  page: { limit: 1, offset: 0, returned: 1 },
};

describe('createDocumentApi', () => {
  it('delegates find to the find adapter', () => {
    const findAdapter = makeFindAdapter(QUERY_RESULT);
    const api = createDocumentApi({
      find: findAdapter,
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const query: Query = { select: { nodeType: 'paragraph' } };
    const result = api.find(query);

    expect(result).toEqual(QUERY_RESULT);
    expect(findAdapter.find).toHaveBeenCalledTimes(1);
  });

  it('delegates find with selector shorthand', () => {
    const findAdapter = makeFindAdapter(QUERY_RESULT);
    const api = createDocumentApi({
      find: findAdapter,
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const result = api.find({ nodeType: 'paragraph' }, { limit: 5 });

    expect(result).toEqual(QUERY_RESULT);
    expect(findAdapter.find).toHaveBeenCalledTimes(1);
  });

  it('delegates getNode to the getNode adapter', () => {
    const getNodeAdpt = makeGetNodeAdapter(PARAGRAPH_INFO);
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: getNodeAdpt,
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const info = api.getNode(PARAGRAPH_ADDRESS);

    expect(info).toEqual(PARAGRAPH_INFO);
    expect(getNodeAdpt.getNode).toHaveBeenCalledWith(PARAGRAPH_ADDRESS);
  });

  it('delegates getNodeById to the getNode adapter', () => {
    const getNodeAdpt = makeGetNodeAdapter(PARAGRAPH_INFO);
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: getNodeAdpt,
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const info = api.getNodeById({ nodeId: 'p1', nodeType: 'paragraph' });

    expect(info).toEqual(PARAGRAPH_INFO);
    expect(getNodeAdpt.getNodeById).toHaveBeenCalledWith({ nodeId: 'p1', nodeType: 'paragraph' });
  });

  it('delegates getText to the getText adapter', () => {
    const getTextAdpt = makeGetTextAdapter('Hello world');
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: getTextAdpt,
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const text = api.getText({});

    expect(text).toBe('Hello world');
    expect(getTextAdpt.getText).toHaveBeenCalledWith({});
  });

  it('delegates info to the info adapter', () => {
    const infoAdpt = makeInfoAdapter({
      counts: { words: 42 },
      outline: [{ level: 1, text: 'Heading', nodeId: 'h1' }],
    });
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: infoAdpt,
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const result = api.info({});

    expect(result.counts.words).toBe(42);
    expect(result.outline).toEqual([{ level: 1, text: 'Heading', nodeId: 'h1' }]);
    expect(infoAdpt.info).toHaveBeenCalledWith({});
  });

  it('delegates comments.create through the comments adapter (root comment)', () => {
    const commentsAdpt = makeCommentsAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: commentsAdpt,
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const input: CommentsCreateInput = {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      text: 'test comment',
    };
    const receipt = api.comments.create(input);

    expect(receipt.success).toBe(true);
    expect(commentsAdpt.add).toHaveBeenCalledWith(input, undefined);
  });

  it('delegates comments.create as reply when parentCommentId is provided', () => {
    const commentsAdpt = makeCommentsAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: commentsAdpt,
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const input: CommentsCreateInput = { parentCommentId: 'c1', text: 'reply text' };
    const receipt = api.comments.create(input);

    expect(receipt.success).toBe(true);
    expect(commentsAdpt.reply).toHaveBeenCalledWith({ parentCommentId: 'c1', text: 'reply text' }, undefined);
  });

  it('delegates all canonical comments operations through the comments adapter', () => {
    const commentsAdpt = makeCommentsAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: commentsAdpt,
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const patchInput: CommentsPatchInput = { commentId: 'c1', text: 'edited' };
    const deleteInput: CommentsDeleteInput = { commentId: 'c1' };
    const getInput: GetCommentInput = { commentId: 'c1' };
    const listQuery: CommentsListQuery = { includeResolved: false };

    const patchReceipt = api.comments.patch(patchInput);
    const deleteReceipt = api.comments.delete(deleteInput);
    const getResult = api.comments.get(getInput);
    const listResult = api.comments.list(listQuery);

    expect(patchReceipt.success).toBe(true);
    expect(deleteReceipt.success).toBe(true);
    expect((getResult as CommentInfo).commentId).toBe('c1');
    expect((listResult as CommentsListResult).total).toBe(0);

    expect(commentsAdpt.edit).toHaveBeenCalledWith({ commentId: 'c1', text: 'edited' }, undefined);
    expect(commentsAdpt.remove).toHaveBeenCalledWith({ commentId: 'c1' }, undefined);
    expect(commentsAdpt.get).toHaveBeenCalledWith(getInput);
    expect(commentsAdpt.list).toHaveBeenCalledWith(listQuery);
  });

  it('delegates write operations through the shared write adapter', () => {
    const writeAdpt = makeWriteAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: writeAdpt,
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
    api.insert({ text: 'Hi' });
    api.insert({ target, text: 'Yo' });
    api.replace({ target, text: 'Hello' }, { changeMode: 'tracked' });
    api.delete({ target });

    expect(writeAdpt.write).toHaveBeenNthCalledWith(
      1,
      { kind: 'insert', text: 'Hi' },
      { changeMode: 'direct', dryRun: false },
    );
    expect(writeAdpt.write).toHaveBeenNthCalledWith(
      2,
      { kind: 'insert', target, text: 'Yo' },
      { changeMode: 'direct', dryRun: false },
    );
    expect(writeAdpt.write).toHaveBeenNthCalledWith(
      3,
      { kind: 'replace', target, text: 'Hello' },
      { changeMode: 'tracked', dryRun: false },
    );
    expect(writeAdpt.write).toHaveBeenNthCalledWith(
      4,
      { kind: 'delete', target, text: '' },
      { changeMode: 'direct', dryRun: false },
    );
  });

  it('delegates format.bold to adapter.apply with marks.bold', () => {
    const formatAdpt = makeFormatAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: formatAdpt,
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
    api.format.bold({ target }, { changeMode: 'tracked' });
    expect(formatAdpt.apply).toHaveBeenCalledWith(
      { target, marks: { bold: true } },
      { changeMode: 'tracked', dryRun: false },
    );
  });

  it('delegates format.italic to adapter.apply with marks.italic', () => {
    const formatAdpt = makeFormatAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: formatAdpt,
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
    api.format.italic({ target }, { changeMode: 'direct' });
    expect(formatAdpt.apply).toHaveBeenCalledWith(
      { target, marks: { italic: true } },
      { changeMode: 'direct', dryRun: false },
    );
  });

  it('delegates format.underline to adapter.apply with marks.underline', () => {
    const formatAdpt = makeFormatAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: formatAdpt,
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
    api.format.underline({ target }, { changeMode: 'direct' });
    expect(formatAdpt.apply).toHaveBeenCalledWith(
      { target, marks: { underline: true } },
      { changeMode: 'direct', dryRun: false },
    );
  });

  it('delegates format.strikethrough to adapter.apply with marks.strike', () => {
    const formatAdpt = makeFormatAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: formatAdpt,
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
    api.format.strikethrough({ target }, { changeMode: 'tracked' });
    expect(formatAdpt.apply).toHaveBeenCalledWith(
      { target, marks: { strike: true } },
      { changeMode: 'tracked', dryRun: false },
    );
  });

  it('delegates trackChanges read operations', () => {
    const trackAdpt = makeTrackChangesAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: trackAdpt,
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const listResult = api.trackChanges.list({ limit: 1 });
    const getResult = api.trackChanges.get({ id: 'tc-1' });

    expect(listResult.total).toBe(0);
    expect(getResult.id).toBe('tc-1');
    expect(trackAdpt.list).toHaveBeenCalledWith({ limit: 1 });
    expect(trackAdpt.get).toHaveBeenCalledWith({ id: 'tc-1' });
  });

  it('delegates review.decide to trackChanges adapter methods', () => {
    const trackAdpt = makeTrackChangesAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: trackAdpt,
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const acceptResult = api.review.decide({ decision: 'accept', target: { id: 'tc-1' } });
    const rejectResult = api.review.decide({ decision: 'reject', target: { id: 'tc-1' } });
    const acceptAllResult = api.review.decide({ decision: 'accept', target: { scope: 'all' } });
    const rejectAllResult = api.review.decide({ decision: 'reject', target: { scope: 'all' } });

    expect(acceptResult.success).toBe(true);
    expect(rejectResult.success).toBe(true);
    expect(acceptAllResult.success).toBe(true);
    expect(rejectAllResult.success).toBe(true);
    expect(trackAdpt.accept).toHaveBeenCalledWith({ id: 'tc-1' }, undefined);
    expect(trackAdpt.reject).toHaveBeenCalledWith({ id: 'tc-1' }, undefined);
    expect(trackAdpt.acceptAll).toHaveBeenCalledWith({}, undefined);
    expect(trackAdpt.rejectAll).toHaveBeenCalledWith({}, undefined);
  });

  it('delegates create.paragraph to the create adapter', () => {
    const createAdpt = makeCreateAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: createAdpt,
      lists: makeListsAdapter(),
    });

    const result = api.create.paragraph(
      {
        at: { kind: 'documentEnd' },
        text: 'Created paragraph',
      },
      { changeMode: 'tracked' },
    );

    expect(result.success).toBe(true);
    expect(createAdpt.paragraph).toHaveBeenCalledWith(
      {
        at: { kind: 'documentEnd' },
        text: 'Created paragraph',
      },
      { changeMode: 'tracked', dryRun: false },
    );
  });

  it('delegates create.heading to the create adapter', () => {
    const createAdpt = makeCreateAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: createAdpt,
      lists: makeListsAdapter(),
    });

    const result = api.create.heading(
      {
        level: 2,
        at: { kind: 'documentEnd' },
        text: 'Created heading',
      },
      { changeMode: 'tracked' },
    );

    expect(result.success).toBe(true);
    expect(createAdpt.heading).toHaveBeenCalledWith(
      {
        level: 2,
        at: { kind: 'documentEnd' },
        text: 'Created heading',
      },
      { changeMode: 'tracked', dryRun: false },
    );
  });

  it('delegates lists namespace operations', () => {
    const listsAdpt = makeListsAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: listsAdpt,
    });

    const target = { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } as const;
    const listResult = api.lists.list({ limit: 1 });
    const getResult = api.lists.get({ address: target });
    const insertResult = api.lists.insert({ target, position: 'after', text: 'Inserted' }, { changeMode: 'tracked' });
    const setTypeResult = api.lists.setType({ target, kind: 'bullet' });
    const indentResult = api.lists.indent({ target });
    const outdentResult = api.lists.outdent({ target });
    const restartResult = api.lists.restart({ target });
    const exitResult = api.lists.exit({ target });

    expect(listResult.total).toBe(0);
    expect(getResult.address).toEqual(target);
    expect(insertResult.success).toBe(true);
    expect(setTypeResult.success).toBe(true);
    expect(indentResult.success).toBe(true);
    expect(outdentResult.success).toBe(true);
    expect(restartResult.success).toBe(true);
    expect(exitResult.success).toBe(true);

    expect(listsAdpt.list).toHaveBeenCalledWith({ limit: 1 });
    expect(listsAdpt.get).toHaveBeenCalledWith({ address: target });
    expect(listsAdpt.insert).toHaveBeenCalledWith(
      { target, position: 'after', text: 'Inserted' },
      { changeMode: 'tracked', dryRun: false },
    );
    expect(listsAdpt.setType).toHaveBeenCalledWith({ target, kind: 'bullet' }, { changeMode: 'direct', dryRun: false });
    expect(listsAdpt.indent).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
    expect(listsAdpt.outdent).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
    expect(listsAdpt.restart).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
    expect(listsAdpt.exit).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
  });

  it('exposes capabilities as a callable function with .get() alias', () => {
    const capAdpt = makeCapabilitiesAdapter();
    const api = createDocumentApi({
      find: makeFindAdapter(QUERY_RESULT),
      getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
      getText: makeGetTextAdapter(),
      info: makeInfoAdapter(),
      capabilities: capAdpt,
      comments: makeCommentsAdapter(),
      write: makeWriteAdapter(),
      format: makeFormatAdapter(),
      trackChanges: makeTrackChangesAdapter(),
      create: makeCreateAdapter(),
      lists: makeListsAdapter(),
    });

    const directResult = api.capabilities();
    const getResult = api.capabilities.get();

    expect(directResult).toEqual(getResult);
    expect(capAdpt.get).toHaveBeenCalledTimes(2);
  });

  describe('insert target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    // -- Truth table: valid cases --

    it('accepts no-target (default insertion point)', () => {
      const api = makeApi();
      const result = api.insert({ text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('accepts canonical target', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } } as const;
      const result = api.insert({ target, text: 'hello' });
      expect(result.success).toBe(true);
    });

    // -- Truth table: invalid cases --

    it('rejects null target', () => {
      const api = makeApi();
      expectValidationError(
        () => api.insert({ target: null, text: 'hello' } as any),
        'target must be a text address object',
      );
    });

    it('rejects malformed target objects', () => {
      const api = makeApi();
      expectValidationError(
        () => api.insert({ target: { kind: 'text', blockId: 'p1' }, text: 'hello' } as any),
        'target must be a text address object',
      );
    });

    // -- Type checks --

    it('rejects non-string text', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 42 } as any), 'text must be a string');
    });

    // -- Validation error shape --

    it('throws DocumentApiValidationError (not plain Error)', () => {
      const api = makeApi();
      try {
        api.insert({ text: 42 } as any);
        expect.fail('Expected error');
      } catch (err: unknown) {
        expect((err as Error).constructor.name).toBe('DocumentApiValidationError');
        expect((err as { code: string }).code).toBe('INVALID_TARGET');
      }
    });

    // -- Input shape guard --

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.insert(null as any), 'non-null object');
    });

    it('rejects numeric input', () => {
      const api = makeApi();
      expectValidationError(() => api.insert(42 as any), 'non-null object');
    });

    it('rejects undefined input', () => {
      const api = makeApi();
      expectValidationError(() => api.insert(undefined as any), 'non-null object');
    });

    // -- Unknown field rejection --

    it('rejects unknown top-level fields', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 'hi', block_id: 'abc' } as any), 'Unknown field "block_id"');
    });

    it('rejects flat blockId as unknown field', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ blockId: 'p1', text: 'hello' } as any), 'Unknown field "blockId"');
    });

    it('rejects flat offset as unknown field', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 'hello', offset: 5 } as any), 'Unknown field "offset"');
    });

    it('rejects pos as unknown field', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 'hi', pos: 3 } as any), 'Unknown field "pos"');
    });

    // -- Backward compatibility parity --

    it('sends same adapter request for insert({ text }) as before', () => {
      const writeAdpt = makeWriteAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: writeAdpt,
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      api.insert({ text: 'hello' });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        { kind: 'insert', text: 'hello' },
        { changeMode: 'direct', dryRun: false },
      );
    });

    it('sends same adapter request for insert({ target, text }) as before', () => {
      const writeAdpt = makeWriteAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: writeAdpt,
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
      api.insert({ target, text: 'hello' });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        { kind: 'insert', target, text: 'hello' },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('replace target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    // -- Truth table: valid cases --

    it('accepts canonical target', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      const result = api.replace({ target, text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('allows collapsed range (start === end) through pre-apply', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 3, end: 3 } } as const;
      const result = api.replace({ target, text: 'hello' });
      expect(result.success).toBe(true);
    });

    // -- Truth table: invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.replace({ text: 'hello' } as any), 'Replace requires a target');
    });

    it('rejects malformed target', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ target: { kind: 'text', blockId: 'p1' }, text: 'hello' } as any),
        'target must be a text address object',
      );
    });

    // -- Type checks --

    it('rejects non-string text', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(() => api.replace({ target, text: 42 } as any), 'text must be a string');
    });

    // -- Input shape --

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.replace(null as any), 'non-null object');
    });

    it('rejects unknown fields', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.replace({ target, text: 'hi', block_id: 'x' } as any),
        'Unknown field "block_id"',
      );
    });

    it('rejects flat blockId as unknown field', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: 0, end: 5, text: 'hello' } as any),
        'Unknown field "blockId"',
      );
    });

    // -- Error shape --

    it('throws DocumentApiValidationError (not plain Error)', () => {
      const api = makeApi();
      try {
        api.replace({ text: 'hello' } as any);
        expect.fail('Expected error');
      } catch (err: unknown) {
        expect((err as Error).constructor.name).toBe('DocumentApiValidationError');
        expect((err as { code: string }).code).toBe('INVALID_TARGET');
      }
    });

    // -- Canonical payload parity --

    it('sends same adapter request for replace({ target, text }) as before', () => {
      const writeAdpt = makeWriteAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: writeAdpt,
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      api.replace({ target, text: 'Hello' });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        { kind: 'replace', target, text: 'Hello' },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('delete target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    // -- Truth table: valid cases --

    it('accepts canonical target', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      const result = api.delete({ target });
      expect(result.success).toBe(true);
    });

    it('allows collapsed range (start === end) through pre-apply', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 3, end: 3 } } as const;
      const result = api.delete({ target });
      expect(result.success).toBe(true);
    });

    // -- Truth table: invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({} as any), 'Delete requires a target');
    });

    it('rejects malformed target', () => {
      const api = makeApi();
      expectValidationError(
        () => api.delete({ target: { kind: 'text', blockId: 'p1' } } as any),
        'target must be a text address object',
      );
    });

    // -- Input shape --

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.delete(null as any), 'non-null object');
    });

    it('rejects unknown fields', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(() => api.delete({ target, offset: 3 } as any), 'Unknown field "offset"');
    });

    it('rejects flat blockId as unknown field', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({ blockId: 'p1', start: 0, end: 5 } as any), 'Unknown field "blockId"');
    });

    // -- Canonical payload parity --

    it('sends same adapter request for delete({ target }) as before', () => {
      const writeAdpt = makeWriteAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: writeAdpt,
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      api.delete({ target });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        { kind: 'delete', target, text: '' },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('format.* target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    const FORMAT_METHODS = ['bold', 'italic', 'underline', 'strikethrough'] as const;

    for (const method of FORMAT_METHODS) {
      describe(`format.${method}`, () => {
        // -- Valid cases --

        it('accepts canonical target', () => {
          const api = makeApi();
          const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
          const result = api.format[method]({ target });
          expect(result.success).toBe(true);
        });

        it('allows collapsed range (start === end) through pre-apply', () => {
          const api = makeApi();
          const target = { kind: 'text', blockId: 'p1', range: { start: 3, end: 3 } } as const;
          const result = api.format[method]({ target });
          expect(result.success).toBe(true);
        });

        // -- Invalid cases --

        it('rejects no target at all', () => {
          const api = makeApi();
          expectValidationError(() => api.format[method]({} as any), 'requires a target');
        });

        it('rejects malformed target', () => {
          const api = makeApi();
          expectValidationError(
            () => api.format[method]({ target: { kind: 'text', blockId: 'p1' } } as any),
            'target must be a text address object',
          );
        });

        // -- Input shape --

        it('rejects null input', () => {
          const api = makeApi();
          // null spreads to {}, so the merged object { marks: {...} } passes shape
          // checks but fails the locator requirement
          expectValidationError(() => api.format[method](null as any), 'requires a target');
        });

        it('rejects unknown fields', () => {
          const api = makeApi();
          const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
          expectValidationError(() => api.format[method]({ target, offset: 3 } as any), 'Unknown field "offset"');
        });

        it('rejects flat blockId as unknown field', () => {
          const api = makeApi();
          expectValidationError(
            () => api.format[method]({ blockId: 'p1', start: 0, end: 5 } as any),
            'Unknown field "blockId"',
          );
        });
      });
    }

    // -- Canonical payload parity --

    it('passes canonical target through to adapter.apply with marks', () => {
      const formatAdpt = makeFormatAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: formatAdpt,
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 2 } } as const;
      api.format.bold({ target });
      expect(formatAdpt.apply).toHaveBeenCalledWith(
        { target, marks: { bold: true } },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('comments.create target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    // -- Valid cases --

    it('accepts canonical target', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      const result = api.comments.create({ target, text: 'comment' });
      expect(result.success).toBe(true);
    });

    it('accepts reply without target (parentCommentId only)', () => {
      const api = makeApi();
      const result = api.comments.create({ parentCommentId: 'c1', text: 'reply' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.comments.create(null as any), 'non-null object');
    });

    it('rejects unknown fields', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.comments.create({ target, text: 'comment', offset: 3 } as any),
        'Unknown field "offset"',
      );
    });

    it('rejects flat blockId as unknown field', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.create({ blockId: 'p1', start: 0, end: 5, text: 'comment' } as any),
        'Unknown field "blockId"',
      );
    });

    it('rejects empty parentCommentId', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.create({ parentCommentId: '', text: 'reply' }),
        'parentCommentId must be a non-empty string',
      );
    });

    it('rejects reply with target (conflicting modes)', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.comments.create({ parentCommentId: 'c1', text: 'reply', target }),
        'Cannot combine parentCommentId with target',
      );
    });

    it('rejects malformed target', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.create({ target: { kind: 'text', blockId: 'p1' }, text: 'comment' } as any),
        'target must be a text address object',
      );
    });

    // -- Canonical payload parity --

    it('sends canonical target through unchanged', () => {
      const commentsAdpt = makeCommentsAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: commentsAdpt,
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      api.comments.create({ target, text: 'comment' });
      expect(commentsAdpt.add).toHaveBeenCalledWith({ target, text: 'comment' }, undefined);
    });
  });

  describe('comments.patch target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    // -- Valid cases --

    it('accepts canonical target', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      const result = api.comments.patch({ commentId: 'c1', target });
      expect(result.success).toBe(true);
    });

    it('accepts text-only patch (no target needed)', () => {
      const api = makeApi();
      const result = api.comments.patch({ commentId: 'c1', text: 'updated' });
      expect(result.success).toBe(true);
    });

    it('accepts status patch (no target needed)', () => {
      const api = makeApi();
      const result = api.comments.patch({ commentId: 'c1', status: 'resolved' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects non-string commentId', () => {
      const api = makeApi();
      expectValidationError(
        () =>
          api.comments.patch({
            commentId: 42,
            target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          } as any),
        'commentId must be a string',
      );
    });

    it('rejects non-string commentId for text-only patch', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.patch({ commentId: 42, text: 'x' } as any),
        'commentId must be a string',
      );
    });

    it('rejects missing commentId for status patch', () => {
      const api = makeApi();
      expectValidationError(() => api.comments.patch({ status: 'resolved' } as any), 'commentId must be a string');
    });

    it('rejects invalid status value', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.patch({ commentId: 'c1', status: 'open' as any }),
        'status must be "resolved"',
      );
    });

    it('rejects malformed target', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.patch({ commentId: 'c1', target: { kind: 'text', blockId: 'p1' } } as any),
        'target must be a text address object',
      );
    });

    it('rejects flat blockId as unknown field', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.patch({ commentId: 'c1', blockId: 'p1', start: 0, end: 5 } as any),
        'Unknown field "blockId"',
      );
    });

    it('rejects invalid locator before applying text edit', () => {
      const commentsAdpt = makeCommentsAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: commentsAdpt,
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      expectValidationError(
        () => api.comments.patch({ commentId: 'c1', text: 'new text', target: { kind: 'text', blockId: 'p1' } } as any),
        'target must be a text address object',
      );
      expect(commentsAdpt.edit).not.toHaveBeenCalled();
    });

    // -- Canonical payload parity --

    it('sends canonical target through to adapter.move', () => {
      const commentsAdpt = makeCommentsAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: commentsAdpt,
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });

      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      api.comments.patch({ commentId: 'c1', target });
      expect(commentsAdpt.move).toHaveBeenCalledWith(
        {
          commentId: 'c1',
          target,
        },
        undefined,
      );
    });
  });

  describe('create.* location validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    // -- Valid cases --

    it('accepts at.target (canonical) for create.paragraph', () => {
      const api = makeApi();
      const result = api.create.paragraph({
        at: { kind: 'before', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
        text: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('accepts documentEnd (no target needed)', () => {
      const api = makeApi();
      const result = api.create.paragraph({ at: { kind: 'documentEnd' }, text: 'Hello' });
      expect(result.success).toBe(true);
    });

    it('accepts documentStart (no target needed)', () => {
      const api = makeApi();
      const result = api.create.paragraph({ at: { kind: 'documentStart' }, text: 'Hello' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects before/after with no target', () => {
      const api = makeApi();
      expectValidationError(
        () => api.create.paragraph({ at: { kind: 'before' } as any, text: 'Hello' }),
        'requires either at.target or at.nodeId',
      );
    });

    // -- Heading --

    it('accepts at.target for create.heading', () => {
      const api = makeApi();
      const result = api.create.heading({
        level: 2,
        at: { kind: 'after', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' } },
        text: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    // -- Parity --

    it('passes at.target through to adapter', () => {
      const createAdpt = makeCreateAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: createAdpt,
        lists: makeListsAdapter(),
      });

      api.create.paragraph({
        at: { kind: 'before', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'abc' } },
        text: 'Hello',
      });
      expect(createAdpt.paragraph).toHaveBeenCalledWith(
        {
          at: { kind: 'before', target: { kind: 'block', nodeType: 'paragraph', nodeId: 'abc' } },
          text: 'Hello',
        },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('lists.* target validation', () => {
    function makeApi() {
      return createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: makeListsAdapter(),
      });
    }

    function expectValidationError(fn: () => void, messageMatch?: string | RegExp) {
      try {
        fn();
        expect.fail('Expected DocumentApiValidationError to be thrown');
      } catch (err: unknown) {
        const e = err as { name: string; code: string; message: string };
        expect(e.name).toBe('DocumentApiValidationError');
        expect(e.code).toBe('INVALID_TARGET');
        if (messageMatch) {
          if (typeof messageMatch === 'string') {
            expect(e.message).toContain(messageMatch);
          } else {
            expect(e.message).toMatch(messageMatch);
          }
        }
      }
    }

    const target = { kind: 'block', nodeType: 'listItem', nodeId: 'li-1' } as const;

    // -- Valid cases --

    it('accepts canonical target for lists.indent', () => {
      const api = makeApi();
      const result = api.lists.indent({ target });
      expect(result.success).toBe(true);
    });

    it('accepts canonical target for lists.insert', () => {
      const api = makeApi();
      const result = api.lists.insert({ target, position: 'after', text: 'New' });
      expect(result.success).toBe(true);
    });

    it('accepts canonical target for lists.setType', () => {
      const api = makeApi();
      const result = api.lists.setType({ target, kind: 'bullet' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.lists.indent({} as any), 'requires a target');
    });

    // -- All list mutation operations validate --

    const LISTS_MUTATIONS = ['outdent', 'restart', 'exit'] as const;
    for (const method of LISTS_MUTATIONS) {
      it(`accepts canonical target for lists.${method}`, () => {
        const api = makeApi();
        const result = api.lists[method]({ target });
        expect(result.success).toBe(true);
      });
    }

    // -- Parity --

    it('passes canonical target through to adapter unchanged', () => {
      const listsAdpt = makeListsAdapter();
      const api = createDocumentApi({
        find: makeFindAdapter(QUERY_RESULT),
        getNode: makeGetNodeAdapter(PARAGRAPH_INFO),
        getText: makeGetTextAdapter(),
        info: makeInfoAdapter(),
        capabilities: makeCapabilitiesAdapter(),
        comments: makeCommentsAdapter(),
        write: makeWriteAdapter(),
        format: makeFormatAdapter(),
        trackChanges: makeTrackChangesAdapter(),
        create: makeCreateAdapter(),
        lists: listsAdpt,
      });

      api.lists.indent({ target });
      expect(listsAdpt.indent).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
    });
  });
});
