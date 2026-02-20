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
});
