import type { DocumentInfo, NodeAddress, NodeInfo, Query, QueryResult } from './types/index.js';
import type {
  AddCommentInput,
  CommentsAdapter,
  EditCommentInput,
  GetCommentInput,
  GoToCommentInput,
  MoveCommentInput,
  RemoveCommentInput,
  ReplyToCommentInput,
  ResolveCommentInput,
  SetCommentActiveInput,
  SetCommentInternalInput,
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

function makeFindAdapter(result: QueryResult): FindAdapter {
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
    list: vi.fn(() => ({ matches: [], total: 0 })),
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
    bold: vi.fn(() => makeFormatReceipt()),
    italic: vi.fn(() => makeFormatReceipt()),
    underline: vi.fn(() => makeFormatReceipt()),
    strikethrough: vi.fn(() => makeFormatReceipt()),
  };
}

function makeTrackChangesAdapter(): TrackChangesAdapter {
  return {
    list: vi.fn((_input) => ({ matches: [], total: 0 })),
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
    list: vi.fn(() => ({ matches: [], total: 0, items: [] })),
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
    operations: {} as DocumentApiCapabilities['operations'],
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

const QUERY_RESULT: QueryResult = {
  matches: [PARAGRAPH_ADDRESS],
  total: 1,
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

  it('delegates comments.add through the comments adapter', () => {
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

    const input: AddCommentInput = {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      text: 'test comment',
    };
    const receipt = api.comments.add(input);

    expect(receipt.success).toBe(true);
    expect(commentsAdpt.add).toHaveBeenCalledWith(input);
  });

  it('delegates all comments namespace commands through the comments adapter', () => {
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

    const editInput: EditCommentInput = { commentId: 'c1', text: 'edited' };
    const replyInput: ReplyToCommentInput = { parentCommentId: 'c1', text: 'reply' };
    const moveInput: MoveCommentInput = {
      commentId: 'c1',
      target: { kind: 'text', blockId: 'p1', range: { start: 1, end: 3 } },
    };
    const resolveInput: ResolveCommentInput = { commentId: 'c1' };
    const removeInput: RemoveCommentInput = { commentId: 'c1' };
    const setInternalInput: SetCommentInternalInput = { commentId: 'c1', isInternal: true };
    const setActiveInput: SetCommentActiveInput = { commentId: 'c1' };
    const goToInput: GoToCommentInput = { commentId: 'c1' };
    const getInput: GetCommentInput = { commentId: 'c1' };
    const listQuery: CommentsListQuery = { includeResolved: false };

    const editReceipt = api.comments.edit(editInput);
    const replyReceipt = api.comments.reply(replyInput);
    const moveReceipt = api.comments.move(moveInput);
    const resolveReceipt = api.comments.resolve(resolveInput);
    const removeReceipt = api.comments.remove(removeInput);
    const setInternalReceipt = api.comments.setInternal(setInternalInput);
    const setActiveReceipt = api.comments.setActive(setActiveInput);
    const goToReceipt = api.comments.goTo(goToInput);
    const getResult = api.comments.get(getInput);
    const listResult = api.comments.list(listQuery);

    expect(editReceipt.success).toBe(true);
    expect(replyReceipt.success).toBe(true);
    expect(moveReceipt.success).toBe(true);
    expect(resolveReceipt.success).toBe(true);
    expect(removeReceipt.success).toBe(true);
    expect(setInternalReceipt.success).toBe(true);
    expect(setActiveReceipt.success).toBe(true);
    expect(goToReceipt.success).toBe(true);
    expect((getResult as CommentInfo).commentId).toBe('c1');
    expect((listResult as CommentsListResult).total).toBe(0);

    expect(commentsAdpt.edit).toHaveBeenCalledWith(editInput);
    expect(commentsAdpt.reply).toHaveBeenCalledWith(replyInput);
    expect(commentsAdpt.move).toHaveBeenCalledWith(moveInput);
    expect(commentsAdpt.resolve).toHaveBeenCalledWith(resolveInput);
    expect(commentsAdpt.remove).toHaveBeenCalledWith(removeInput);
    expect(commentsAdpt.setInternal).toHaveBeenCalledWith(setInternalInput);
    expect(commentsAdpt.setActive).toHaveBeenCalledWith(setActiveInput);
    expect(commentsAdpt.goTo).toHaveBeenCalledWith(goToInput);
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

  it('delegates format.bold to the format adapter', () => {
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
    expect(formatAdpt.bold).toHaveBeenCalledWith({ target }, { changeMode: 'tracked', dryRun: false });
  });

  it('delegates format.italic to the format adapter', () => {
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
    expect(formatAdpt.italic).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
  });

  it('delegates format.underline to the format adapter', () => {
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
    expect(formatAdpt.underline).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
  });

  it('delegates format.strikethrough to the format adapter', () => {
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
    expect(formatAdpt.strikethrough).toHaveBeenCalledWith({ target }, { changeMode: 'tracked', dryRun: false });
  });

  it('delegates trackChanges namespace operations', () => {
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
    const acceptResult = api.trackChanges.accept({ id: 'tc-1' });
    const rejectResult = api.trackChanges.reject({ id: 'tc-1' });
    const acceptAllResult = api.trackChanges.acceptAll({});
    const rejectAllResult = api.trackChanges.rejectAll({});

    expect(listResult.total).toBe(0);
    expect(getResult.id).toBe('tc-1');
    expect(acceptResult.success).toBe(true);
    expect(rejectResult.success).toBe(true);
    expect(acceptAllResult.success).toBe(true);
    expect(rejectAllResult.success).toBe(true);
    expect(trackAdpt.list).toHaveBeenCalledWith({ limit: 1 });
    expect(trackAdpt.get).toHaveBeenCalledWith({ id: 'tc-1' });
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

  describe('insert friendly locator validation', () => {
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

    it('accepts blockId alone (offset defaults to 0)', () => {
      const api = makeApi();
      const result = api.insert({ blockId: 'p1', text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('accepts blockId + offset', () => {
      const api = makeApi();
      const result = api.insert({ blockId: 'p1', offset: 5, text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('accepts offset of 0', () => {
      const api = makeApi();
      const result = api.insert({ blockId: 'p1', offset: 0, text: 'hello' });
      expect(result.success).toBe(true);
    });

    // -- Truth table: invalid cases --

    it('rejects target + blockId (mixed modes)', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } } as const;
      expectValidationError(
        () => api.insert({ target, blockId: 'p2', text: 'hello' }),
        'Cannot combine target with blockId',
      );
    });

    it('rejects offset without blockId', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ offset: 5, text: 'hello' } as any), 'offset requires blockId');
    });

    it('rejects target + offset without blockId', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 0 } } as const;
      expectValidationError(
        () => api.insert({ target, offset: 5, text: 'hello' } as any),
        'Cannot combine target with offset',
      );
    });

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

    // -- Numeric bounds --

    it('rejects negative offset', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ blockId: 'p1', offset: -1, text: 'hello' }), 'non-negative integer');
    });

    it('rejects non-integer offset', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ blockId: 'p1', offset: 1.5, text: 'hello' }), 'non-negative integer');
    });

    // -- Type checks --

    it('rejects non-string blockId', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ blockId: 42, text: 'hello' } as any), 'blockId must be a string');
    });

    it('rejects non-string text', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 42 } as any), 'text must be a string');
    });

    // -- Validation error shape --

    it('throws DocumentApiValidationError (not plain Error)', () => {
      const api = makeApi();
      try {
        api.insert({ offset: 5, text: 'hello' } as any);
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

    // -- pos runtime rejection --

    it('rejects pos (not yet supported)', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 'hi', pos: 3 } as any), 'pos locator is not yet supported');
    });

    // -- Validation precedence: pos before unknown-field --

    it('returns pos error before unknown-field error', () => {
      const api = makeApi();
      expectValidationError(
        () => api.insert({ text: 'hi', pos: 3, block_id: 'x' } as any),
        'pos locator is not yet supported',
      );
    });

    it('returns pos error before mode-exclusivity error', () => {
      const api = makeApi();
      expectValidationError(
        () => api.insert({ text: 'hi', pos: 3, blockId: 'x' } as any),
        'pos locator is not yet supported',
      );
    });

    // -- Unknown field rejection --

    it('rejects unknown top-level fields', () => {
      const api = makeApi();
      expectValidationError(() => api.insert({ text: 'hi', block_id: 'abc' } as any), 'Unknown field "block_id"');
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

    it('passes blockId + offset through to adapter for normalization', () => {
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

      api.insert({ blockId: 'p1', offset: 5, text: 'hello' });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        {
          kind: 'insert',
          blockId: 'p1',
          offset: 5,
          text: 'hello',
        },
        { changeMode: 'direct', dryRun: false },
      );
    });

    it('passes blockId without offset through to adapter', () => {
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

      api.insert({ blockId: 'p1', text: 'hello' });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        {
          kind: 'insert',
          blockId: 'p1',
          text: 'hello',
        },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('replace friendly locator validation', () => {
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

    it('accepts blockId + start + end', () => {
      const api = makeApi();
      const result = api.replace({ blockId: 'p1', start: 0, end: 5, text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('allows collapsed range (start === end) through pre-apply', () => {
      const api = makeApi();
      const result = api.replace({ blockId: 'p1', start: 3, end: 3, text: 'hello' });
      expect(result.success).toBe(true);
    });

    // -- Truth table: invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.replace({ text: 'hello' } as any), 'Replace requires a target');
    });

    it('rejects target + blockId (mixed modes)', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.replace({ target, blockId: 'p2', start: 0, end: 5, text: 'hello' }),
        'Cannot combine target with blockId/start/end',
      );
    });

    it('rejects blockId alone (incomplete range)', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', text: 'hello' } as any),
        'blockId requires both start and end',
      );
    });

    it('rejects blockId + start without end', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: 0, text: 'hello' } as any),
        'blockId requires both start and end',
      );
    });

    it('rejects blockId + end without start', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', end: 5, text: 'hello' } as any),
        'blockId requires both start and end',
      );
    });

    it('rejects start/end without blockId', () => {
      const api = makeApi();
      expectValidationError(() => api.replace({ start: 0, end: 5, text: 'hello' } as any), 'start/end require blockId');
    });

    it('rejects start without blockId', () => {
      const api = makeApi();
      expectValidationError(() => api.replace({ start: 0, text: 'hello' } as any), 'start/end require blockId');
    });

    // -- Numeric bounds --

    it('rejects negative start', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: -1, end: 5, text: 'hello' }),
        'non-negative integer',
      );
    });

    it('rejects non-integer end', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: 0, end: 5.5, text: 'hello' }),
        'non-negative integer',
      );
    });

    it('rejects start > end', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: 10, end: 5, text: 'hello' }),
        'start must be <= end',
      );
    });

    // -- Type checks --

    it('rejects non-string blockId', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 42, start: 0, end: 5, text: 'hello' } as any),
        'blockId must be a string',
      );
    });

    it('rejects non-string text', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: 0, end: 5, text: 42 } as any),
        'text must be a string',
      );
    });

    // -- Input shape --

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.replace(null as any), 'non-null object');
    });

    it('rejects unknown fields', () => {
      const api = makeApi();
      expectValidationError(
        () => api.replace({ blockId: 'p1', start: 0, end: 5, text: 'hi', block_id: 'x' } as any),
        'Unknown field "block_id"',
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

    it('passes blockId + start + end through to adapter for normalization', () => {
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

      api.replace({ blockId: 'p1', start: 0, end: 5, text: 'hello' });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        { kind: 'replace', blockId: 'p1', start: 0, end: 5, text: 'hello' },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('delete friendly locator validation', () => {
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

    it('accepts blockId + start + end', () => {
      const api = makeApi();
      const result = api.delete({ blockId: 'p1', start: 0, end: 5 });
      expect(result.success).toBe(true);
    });

    it('allows collapsed range (start === end) through pre-apply', () => {
      const api = makeApi();
      const result = api.delete({ blockId: 'p1', start: 3, end: 3 });
      expect(result.success).toBe(true);
    });

    // -- Truth table: invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({} as any), 'Delete requires a target');
    });

    it('rejects target + blockId (mixed modes)', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.delete({ target, blockId: 'p2', start: 0, end: 5 }),
        'Cannot combine target with blockId/start/end',
      );
    });

    it('rejects blockId alone (incomplete range)', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({ blockId: 'p1' } as any), 'blockId requires both start and end');
    });

    it('rejects start/end without blockId', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({ start: 0, end: 5 } as any), 'start/end require blockId');
    });

    // -- Numeric bounds --

    it('rejects negative start', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({ blockId: 'p1', start: -1, end: 5 }), 'non-negative integer');
    });

    it('rejects start > end', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({ blockId: 'p1', start: 10, end: 5 }), 'start must be <= end');
    });

    // -- Type checks --

    it('rejects non-string blockId', () => {
      const api = makeApi();
      expectValidationError(() => api.delete({ blockId: 42, start: 0, end: 5 } as any), 'blockId must be a string');
    });

    // -- Input shape --

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.delete(null as any), 'non-null object');
    });

    it('rejects unknown fields', () => {
      const api = makeApi();
      expectValidationError(
        () => api.delete({ blockId: 'p1', start: 0, end: 5, offset: 3 } as any),
        'Unknown field "offset"',
      );
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

    it('passes blockId + start + end through to adapter for normalization', () => {
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

      api.delete({ blockId: 'p1', start: 0, end: 5 });
      expect(writeAdpt.write).toHaveBeenCalledWith(
        { kind: 'delete', blockId: 'p1', start: 0, end: 5, text: '' },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('format.* friendly locator validation', () => {
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

        it('accepts blockId + start + end', () => {
          const api = makeApi();
          const result = api.format[method]({ blockId: 'p1', start: 0, end: 5 });
          expect(result.success).toBe(true);
        });

        it('allows collapsed range (start === end) through pre-apply', () => {
          const api = makeApi();
          const result = api.format[method]({ blockId: 'p1', start: 3, end: 3 });
          expect(result.success).toBe(true);
        });

        // -- Invalid cases --

        it('rejects no target at all', () => {
          const api = makeApi();
          expectValidationError(() => api.format[method]({} as any), 'requires a target');
        });

        it('rejects target + blockId (mixed modes)', () => {
          const api = makeApi();
          const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
          expectValidationError(
            () => api.format[method]({ target, blockId: 'p2', start: 0, end: 5 }),
            'Cannot combine target with blockId/start/end',
          );
        });

        it('rejects blockId alone (incomplete range)', () => {
          const api = makeApi();
          expectValidationError(
            () => api.format[method]({ blockId: 'p1' } as any),
            'blockId requires both start and end',
          );
        });

        it('rejects start/end without blockId', () => {
          const api = makeApi();
          expectValidationError(() => api.format[method]({ start: 0, end: 5 } as any), 'start/end require blockId');
        });

        // -- Numeric bounds --

        it('rejects negative start', () => {
          const api = makeApi();
          expectValidationError(() => api.format[method]({ blockId: 'p1', start: -1, end: 5 }), 'non-negative integer');
        });

        it('rejects start > end', () => {
          const api = makeApi();
          expectValidationError(() => api.format[method]({ blockId: 'p1', start: 10, end: 5 }), 'start must be <= end');
        });

        // -- Input shape --

        it('rejects null input', () => {
          const api = makeApi();
          expectValidationError(() => api.format[method](null as any), 'non-null object');
        });

        it('rejects unknown fields', () => {
          const api = makeApi();
          expectValidationError(
            () => api.format[method]({ blockId: 'p1', start: 0, end: 5, offset: 3 } as any),
            'Unknown field "offset"',
          );
        });
      });
    }

    // -- Canonical payload parity --

    it('passes canonical target through to format adapter unchanged', () => {
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
      expect(formatAdpt.bold).toHaveBeenCalledWith({ target }, { changeMode: 'direct', dryRun: false });
    });

    it('passes blockId + start + end through to format adapter for normalization', () => {
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

      api.format.bold({ blockId: 'p1', start: 0, end: 5 });
      expect(formatAdpt.bold).toHaveBeenCalledWith(
        { blockId: 'p1', start: 0, end: 5 },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('comments.add friendly locator validation', () => {
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
      const result = api.comments.add({ target, text: 'comment' });
      expect(result.success).toBe(true);
    });

    it('accepts blockId + start + end', () => {
      const api = makeApi();
      const result = api.comments.add({ blockId: 'p1', start: 0, end: 5, text: 'comment' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.comments.add({ text: 'comment' } as any), 'requires a target');
    });

    it('rejects target + blockId (mixed modes)', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.comments.add({ target, blockId: 'p2', start: 0, end: 5, text: 'comment' }),
        'Cannot combine target with blockId/start/end',
      );
    });

    it('rejects blockId alone (incomplete range)', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.add({ blockId: 'p1', text: 'comment' } as any),
        'blockId requires both start and end',
      );
    });

    it('rejects start/end without blockId', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.add({ start: 0, end: 5, text: 'comment' } as any),
        'start/end require blockId',
      );
    });

    it('rejects negative start', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.add({ blockId: 'p1', start: -1, end: 5, text: 'comment' }),
        'non-negative integer',
      );
    });

    it('rejects start > end', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.add({ blockId: 'p1', start: 10, end: 5, text: 'comment' }),
        'start must be <= end',
      );
    });

    it('rejects null input', () => {
      const api = makeApi();
      expectValidationError(() => api.comments.add(null as any), 'non-null object');
    });

    it('rejects unknown fields', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.add({ blockId: 'p1', start: 0, end: 5, text: 'comment', offset: 3 } as any),
        'Unknown field "offset"',
      );
    });

    // -- Canonical payload parity --

    it('normalizes blockId + start + end to target before passing to adapter', () => {
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

      api.comments.add({ blockId: 'p1', start: 0, end: 5, text: 'comment' });
      expect(commentsAdpt.add).toHaveBeenCalledWith({
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
        text: 'comment',
      });
    });

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
      api.comments.add({ target, text: 'comment' });
      expect(commentsAdpt.add).toHaveBeenCalledWith({ target, text: 'comment' });
    });
  });

  describe('comments.move friendly locator validation', () => {
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
      const result = api.comments.move({ commentId: 'c1', target });
      expect(result.success).toBe(true);
    });

    it('accepts blockId + start + end', () => {
      const api = makeApi();
      const result = api.comments.move({ commentId: 'c1', blockId: 'p1', start: 0, end: 5 });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects no target at all', () => {
      const api = makeApi();
      expectValidationError(() => api.comments.move({ commentId: 'c1' } as any), 'requires a target');
    });

    it('rejects target + blockId (mixed modes)', () => {
      const api = makeApi();
      const target = { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } } as const;
      expectValidationError(
        () => api.comments.move({ commentId: 'c1', target, blockId: 'p2', start: 0, end: 5 }),
        'Cannot combine target with blockId/start/end',
      );
    });

    it('rejects blockId alone (incomplete range)', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.move({ commentId: 'c1', blockId: 'p1' } as any),
        'blockId requires both start and end',
      );
    });

    it('rejects start > end', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.move({ commentId: 'c1', blockId: 'p1', start: 10, end: 5 }),
        'start must be <= end',
      );
    });

    it('rejects non-string commentId', () => {
      const api = makeApi();
      expectValidationError(
        () => api.comments.move({ commentId: 42, blockId: 'p1', start: 0, end: 5 } as any),
        'commentId must be a string',
      );
    });

    // -- Canonical payload parity --

    it('normalizes blockId + start + end to target before passing to adapter', () => {
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

      api.comments.move({ commentId: 'c1', blockId: 'p1', start: 0, end: 5 });
      expect(commentsAdpt.move).toHaveBeenCalledWith({
        commentId: 'c1',
        target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
      });
    });
  });

  describe('create.* nodeId shorthand validation', () => {
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

    it('accepts at.nodeId (shorthand) for create.paragraph', () => {
      const api = makeApi();
      const result = api.create.paragraph({
        at: { kind: 'after', nodeId: 'p1' },
        text: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('accepts documentEnd (no target/nodeId needed)', () => {
      const api = makeApi();
      const result = api.create.paragraph({ at: { kind: 'documentEnd' }, text: 'Hello' });
      expect(result.success).toBe(true);
    });

    it('accepts documentStart (no target/nodeId needed)', () => {
      const api = makeApi();
      const result = api.create.paragraph({ at: { kind: 'documentStart' }, text: 'Hello' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects at.target + at.nodeId (mixed modes) for create.paragraph', () => {
      const api = makeApi();
      expectValidationError(
        () =>
          api.create.paragraph({
            at: {
              kind: 'before',
              target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
              nodeId: 'p2',
            } as any,
            text: 'Hello',
          }),
        'Cannot combine at.target with at.nodeId',
      );
    });

    it('rejects before/after with neither target nor nodeId', () => {
      const api = makeApi();
      expectValidationError(
        () => api.create.paragraph({ at: { kind: 'before' } as any, text: 'Hello' }),
        'requires either at.target or at.nodeId',
      );
    });

    it('rejects non-string at.nodeId', () => {
      const api = makeApi();
      expectValidationError(
        () => api.create.paragraph({ at: { kind: 'before', nodeId: 42 } as any, text: 'Hello' }),
        'at.nodeId must be a string',
      );
    });

    // -- Heading --

    it('accepts at.nodeId for create.heading', () => {
      const api = makeApi();
      const result = api.create.heading({
        level: 2,
        at: { kind: 'after', nodeId: 'p1' },
        text: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mixed modes for create.heading', () => {
      const api = makeApi();
      expectValidationError(
        () =>
          api.create.heading({
            level: 2,
            at: {
              kind: 'after',
              target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
              nodeId: 'p2',
            } as any,
            text: 'Hello',
          }),
        'Cannot combine at.target with at.nodeId',
      );
    });

    // -- Parity --

    it('passes at.nodeId through to adapter for resolution', () => {
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

      api.create.paragraph({ at: { kind: 'before', nodeId: 'abc' }, text: 'Hello' });
      expect(createAdpt.paragraph).toHaveBeenCalledWith(
        { at: { kind: 'before', nodeId: 'abc' }, text: 'Hello' },
        { changeMode: 'direct', dryRun: false },
      );
    });
  });

  describe('lists.* nodeId shorthand validation', () => {
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

    it('accepts nodeId shorthand for lists.indent', () => {
      const api = makeApi();
      const result = api.lists.indent({ nodeId: 'li-1' });
      expect(result.success).toBe(true);
    });

    it('accepts nodeId shorthand for lists.insert', () => {
      const api = makeApi();
      const result = api.lists.insert({ nodeId: 'li-1', position: 'after', text: 'New' });
      expect(result.success).toBe(true);
    });

    it('accepts nodeId shorthand for lists.setType', () => {
      const api = makeApi();
      const result = api.lists.setType({ nodeId: 'li-1', kind: 'bullet' });
      expect(result.success).toBe(true);
    });

    // -- Invalid cases --

    it('rejects target + nodeId (mixed modes)', () => {
      const api = makeApi();
      expectValidationError(() => api.lists.indent({ target, nodeId: 'li-2' }), 'Cannot combine target with nodeId');
    });

    it('rejects no target and no nodeId', () => {
      const api = makeApi();
      expectValidationError(() => api.lists.indent({} as any), 'requires a target');
    });

    it('rejects non-string nodeId', () => {
      const api = makeApi();
      expectValidationError(() => api.lists.indent({ nodeId: 42 } as any), 'nodeId must be a string');
    });

    // -- All list mutation operations validate --

    const LISTS_MUTATIONS = ['outdent', 'restart', 'exit'] as const;
    for (const method of LISTS_MUTATIONS) {
      it(`rejects mixed modes for lists.${method}`, () => {
        const api = makeApi();
        expectValidationError(() => api.lists[method]({ target, nodeId: 'li-2' }), 'Cannot combine target with nodeId');
      });

      it(`accepts nodeId for lists.${method}`, () => {
        const api = makeApi();
        const result = api.lists[method]({ nodeId: 'li-1' });
        expect(result.success).toBe(true);
      });
    }

    // -- Parity --

    it('passes nodeId through to adapter for resolution', () => {
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

      api.lists.indent({ nodeId: 'li-1' });
      expect(listsAdpt.indent).toHaveBeenCalledWith({ nodeId: 'li-1' }, { changeMode: 'direct', dryRun: false });
    });

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
