import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, defineComponent, ref, reactive, nextTick } from 'vue';
import { DOCX } from '@superdoc/common';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Extension } from '../../super-editor/src/core/Extension.js';
import { CommentsPlugin, CommentsPluginKey } from '../../super-editor/src/extensions/comment/comments-plugin.js';
import { CommentMarkName } from '../../super-editor/src/extensions/comment/comments-constants.js';

const isRef = (value) => value && typeof value === 'object' && 'value' in value;

// Mock state for PresentationEditor
const mockState = { instances: new Map() };

vi.mock('pinia', async () => {
  const actual = await vi.importActual('pinia');
  return {
    ...actual,
    storeToRefs: (store) => {
      const result = {};
      for (const key of Object.keys(store)) {
        if (isRef(store[key])) {
          result[key] = store[key];
        }
      }
      return result;
    },
  };
});

let superdocStoreStub;
let commentsStoreStub;

vi.mock('@superdoc/stores/superdoc-store', () => ({
  useSuperdocStore: () => superdocStoreStub,
}));

vi.mock('@superdoc/stores/comments-store', () => ({
  useCommentsStore: () => commentsStoreStub,
}));

const useSelectionMock = vi.fn((params) => ({
  selectionBounds: params.selectionBounds || {},
  getValues: () => ({ ...params }),
}));

vi.mock('@superdoc/helpers/use-selection', () => ({
  default: useSelectionMock,
}));

const useSelectedTextMock = vi.fn(() => ({ selectedText: ref('') }));
vi.mock('@superdoc/composables/use-selected-text', () => ({
  useSelectedText: useSelectedTextMock,
}));

const useAiMock = vi.fn(() => ({
  showAiLayer: ref(false),
  showAiWriter: ref(false),
  aiWriterPosition: reactive({ top: '0px', left: '0px' }),
  aiLayer: ref(null),
  initAiLayer: vi.fn(),
  showAiWriterAtCursor: vi.fn(),
  handleAiWriterClose: vi.fn(),
  handleAiToolClick: vi.fn(),
}));

vi.mock('@superdoc/composables/use-ai', () => ({
  useAi: useAiMock,
}));

vi.mock('@superdoc/composables/use-high-contrast-mode', () => ({
  useHighContrastMode: () => ({ isHighContrastMode: ref(false) }),
}));

const stubComponent = (name) =>
  defineComponent({
    name,
    props: ['comment', 'autoFocus', 'parent', 'documentData', 'config', 'documentId', 'fileSource', 'state', 'options'],
    emits: ['pageMarginsChange', 'ready', 'selection-change', 'page-loaded', 'page-ready', 'bypass-selection'],
    setup(props, { slots }) {
      return () => h('div', { class: `${name}-stub` }, slots.default ? slots.default() : undefined);
    },
  });

const SuperEditorStub = defineComponent({
  name: 'SuperEditorStub',
  props: ['fileSource', 'state', 'documentId', 'options'],
  emits: ['pageMarginsChange', 'editor-ready'],
  setup(props) {
    return () => h('div', { class: 'super-editor-stub' }, [JSON.stringify(props.options.documentId)]);
  },
});

const AIWriterStub = stubComponent('AIWriter');
const CommentDialogStub = stubComponent('CommentDialog');
const FloatingCommentsStub = stubComponent('FloatingComments');
const CommentsLayerStub = stubComponent('CommentsLayer');
const HrbrFieldsLayerStub = stubComponent('HrbrFieldsLayer');
const AiLayerStub = stubComponent('AiLayer');
const HtmlViewerStub = stubComponent('HtmlViewer');

// Mock @superdoc/super-editor with stubs and PresentationEditor class
vi.mock('@superdoc/super-editor', () => ({
  SuperEditor: SuperEditorStub,
  AIWriter: AIWriterStub,
  PresentationEditor: class PresentationEditorMock {
    static getInstance(documentId) {
      return mockState.instances.get(documentId);
    }

    static setGlobalZoom(zoom) {
      mockState.instances.forEach((instance) => {
        instance?.setZoom?.(zoom);
      });
    }
  },
}));

vi.mock('./components/HtmlViewer/HtmlViewer.vue', () => ({
  default: HtmlViewerStub,
}));

vi.mock('@superdoc/components/CommentsLayer/CommentDialog.vue', () => ({
  default: CommentDialogStub,
}));

vi.mock('@superdoc/components/CommentsLayer/FloatingComments.vue', () => ({
  default: FloatingCommentsStub,
}));

vi.mock('@superdoc/components/HrbrFieldsLayer/HrbrFieldsLayer.vue', () => ({
  default: HrbrFieldsLayerStub,
}));

vi.mock('@superdoc/components/AiLayer/AiLayer.vue', () => ({
  default: AiLayerStub,
}));

vi.mock('@superdoc/components/CommentsLayer/CommentsLayer.vue', () => ({
  default: CommentsLayerStub,
}));

const buildSuperdocStore = () => {
  const documents = ref([
    {
      id: 'doc-1',
      type: DOCX,
      data: 'mock-data',
      state: {},
      html: '<p></p>',
      markdown: '',
      isReady: false,
      rulers: false,
      setEditor: vi.fn(),
      getEditor: vi.fn(() => null),
    },
  ]);

  return {
    documents,
    isReady: ref(false),
    areDocumentsReady: ref(true),
    selectionPosition: ref(null),
    activeSelection: ref(null),
    activeZoom: ref(100),
    modules: reactive({ comments: { readOnly: false }, ai: {}, 'hrbr-fields': [] }),
    handlePageReady: vi.fn(),
    user: { name: 'Ada', email: 'ada@example.com' },
    getDocument: vi.fn((id) => documents.value.find((d) => d.id === id)),
  };
};

const buildCommentsStore = () => ({
  init: vi.fn(),
  showAddComment: vi.fn(),
  handleEditorLocationsUpdate: vi.fn(),
  clearEditorCommentPositions: vi.fn(),
  handleTrackedChangeUpdate: vi.fn(),
  syncTrackedChangeComments: vi.fn(),
  removePendingComment: vi.fn(),
  setActiveComment: vi.fn(),
  addComment: vi.fn(),
  getComment: vi.fn(() => null),
  getCommentDocumentId: vi.fn((comment) => {
    if (!comment) return null;
    if (comment.fileId != null) return String(comment.fileId);
    if (comment.documentId != null) return String(comment.documentId);
    if (comment.selection?.documentId != null) return String(comment.selection.documentId);
    return null;
  }),
  belongsToDocument: vi.fn((comment, activeDocumentId) => {
    if (!activeDocumentId) return false;
    const commentDocumentId =
      comment?.fileId != null
        ? String(comment.fileId)
        : comment?.documentId != null
          ? String(comment.documentId)
          : comment?.selection?.documentId != null
            ? String(comment.selection.documentId)
            : null;
    if (commentDocumentId) return commentDocumentId === String(activeDocumentId);

    const docs = superdocStoreStub?.documents?.value;
    if (Array.isArray(docs) && docs.length === 1) {
      const onlyDocumentId = docs[0]?.id != null ? String(docs[0].id) : null;
      return onlyDocumentId === String(activeDocumentId);
    }

    return false;
  }),
  COMMENT_EVENTS: {
    ADD: 'add',
    UPDATE: 'update',
    DELETED: 'deleted',
  },
  processLoadedDocxComments: vi.fn(),
  translateCommentsForExport: vi.fn(() => []),
  getPendingComment: vi.fn(() => ({ commentId: 'pending', selection: { getValues: () => ({}) } })),
  commentsParentElement: null,
  editorCommentIds: [],
  proxy: null,
  commentsList: ref([]),
  lastUpdate: null,
  gesturePositions: ref([]),
  suppressInternalExternal: ref(false),
  getConfig: ref({ readOnly: false }),
  activeComment: ref(null),
  floatingCommentsOffset: ref(0),
  pendingComment: ref(null),
  currentCommentText: ref('<p>Text</p>'),
  isDebugging: ref(false),
  editingCommentId: ref(null),
  editorCommentPositions: ref([]),
  skipSelectionUpdate: ref(false),
  documentsWithConverations: ref([]),
  commentsByDocument: ref(new Map()),
  isCommentsListVisible: ref(false),
  isFloatingCommentsReady: ref(false),
  generalCommentIds: ref([]),
  getFloatingComments: ref([]),
  hasSyncedCollaborationComments: ref(false),
  hasInitializedLocations: ref(true),
  isCommentHighlighted: ref(false),
});

const mountComponent = async (superdocStub) => {
  superdocStoreStub = buildSuperdocStore();
  commentsStoreStub = buildCommentsStore();
  superdocStoreStub.modules.ai = { endpoint: '/ai' };
  commentsStoreStub.documentsWithConverations.value = [{ id: 'doc-1' }];

  const component = (await import('./SuperDoc.vue')).default;

  return mount(component, {
    global: {
      components: {
        SuperEditor: SuperEditorStub,
        CommentDialog: CommentDialogStub,
        FloatingComments: FloatingCommentsStub,
        HrbrFieldsLayer: HrbrFieldsLayerStub,
        AIWriter: AIWriterStub,
      },
      config: {
        globalProperties: {
          $superdoc: superdocStub,
        },
      },
      directives: {
        'click-outside': {
          mounted(el, binding) {
            el.__clickOutside = binding.value;
          },
          unmounted(el) {
            delete el.__clickOutside;
          },
        },
      },
    },
  });
};

const createSuperdocStub = () => {
  const toolbar = { config: { aiApiKey: 'abc' }, setActiveEditor: vi.fn(), updateToolbarState: vi.fn() };
  return {
    config: {
      modules: { comments: {}, ai: {}, toolbar: {}, pdf: {} },
      isDebug: false,
      documentMode: 'editing',
      role: 'editor',
      suppressDefaultDocxStyles: false,
      disableContextMenu: false,
      layoutEngineOptions: {},
    },
    activeEditor: null,
    toolbar,
    colors: ['#111'],
    broadcastEditorBeforeCreate: vi.fn(),
    broadcastEditorCreate: vi.fn(),
    broadcastEditorDestroy: vi.fn(),
    broadcastPdfDocumentReady: vi.fn(),
    broadcastSidebarToggle: vi.fn(),
    setActiveEditor: vi.fn(),
    lockSuperdoc: vi.fn(),
    emit: vi.fn(),
    listeners: vi.fn(),
    captureLayoutPipelineEvent: vi.fn(),
    canPerformPermission: vi.fn(() => true),
  };
};

const createFloatingCommentsSchema = () =>
  new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
      text: { group: 'inline' },
    },
    marks: {
      [CommentMarkName]: {
        attrs: { commentId: { default: null }, importedId: { default: null }, internal: { default: true } },
        inclusive: false,
        toDOM: (mark) => [CommentMarkName, mark.attrs],
        parseDOM: [{ tag: CommentMarkName }],
      },
    },
  });

const createImportedCommentDoc = (threadId) => {
  const schema = createFloatingCommentsSchema();
  const importedMark = schema.marks[CommentMarkName].create({ importedId: threadId, internal: true });
  const paragraph = schema.node('paragraph', null, [schema.text('Imported', [importedMark])]);
  const doc = schema.node('doc', null, [paragraph]);

  return { schema, doc };
};

const createCommentsPluginEnvironment = ({ schema, doc }) => {
  const selection = TextSelection.create(doc, 1);
  let state = EditorState.create({ schema, doc, selection });

  const editor = {
    options: { documentId: 'doc-1' },
    emit: vi.fn(),
    view: null,
  };

  const extension = Extension.create(CommentsPlugin.config);
  extension.addCommands = CommentsPlugin.config.addCommands.bind(extension);
  extension.addPmPlugins = CommentsPlugin.config.addPmPlugins.bind(extension);
  extension.editor = editor;
  const [plugin] = extension.addPmPlugins();

  state = EditorState.create({ schema, doc, selection, plugins: [plugin] });

  const view = {
    state,
    dispatch: vi.fn((tr) => {
      state = state.apply(tr);
      view.state = state;
    }),
    focus: vi.fn(),
    coordsAtPos: vi.fn(),
  };

  editor.view = view;
  const pluginView = plugin.spec.view?.(view);

  return { editor, view, pluginView };
};

describe('SuperDoc.vue', () => {
  beforeEach(() => {
    useSelectionMock.mockClear();
    useAiMock.mockClear();
    useSelectedTextMock.mockClear();
    mockState.instances.clear();

    // Make RAF synchronous in tests — jsdom has no rendering loop, and
    // SuperDoc.vue defers selection updates via requestAnimationFrame.
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(Date.now());
      return 0;
    });

    // Set up default mock presentation editor instances for common document IDs
    const mockPresentationEditor = {
      getSelectionBounds: vi.fn(() => ({
        bounds: { top: 100, left: 10, right: 80, bottom: 160 },
        pageIndex: 0,
      })),
      getCommentBounds: vi.fn((positions) => positions),
      getRangeRects: vi.fn(() => []),
      getPages: vi.fn(() => []),
      getLayoutError: vi.fn(() => null),
      setZoom: vi.fn(),
    };
    mockState.instances.set('doc-1', mockPresentationEditor);

    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires editor lifecycle events and propagates updates', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const editorComponent = wrapper.findComponent(SuperEditorStub);
    expect(editorComponent.exists()).toBe(true);

    const options = editorComponent.props('options');
    const editorMock = {
      options: { documentId: 'doc-1' },
      commands: {
        togglePagination: vi.fn(),
        insertAiMark: vi.fn(),
        setCursorById: vi.fn(),
        search: vi.fn(),
        goToSearchResult: vi.fn(),
      },
      state: {
        doc: { content: { size: 100 } },
        selection: { $from: { pos: 1 }, $to: { pos: 3 } },
      },
      view: {
        coordsAtPos: vi.fn((pos) =>
          pos === 1 ? { top: 100, bottom: 120, left: 10, right: 20 } : { top: 130, bottom: 160, left: 60, right: 80 },
        ),
        state: { selection: { $from: { pos: 1 }, $to: { pos: 3 } } },
      },
      getPageStyles: vi.fn(() => ({ pageMargins: {} })),
    };

    // processSelectionChange needs layers to be non-null to proceed past the guard
    wrapper.vm.$.setupState.layers = document.createElement('div');

    options.onBeforeCreate({ editor: editorMock });
    expect(superdocStub.broadcastEditorBeforeCreate).toHaveBeenCalled();

    options.onCreate({ editor: editorMock });
    expect(superdocStoreStub.documents.value[0].setEditor).toHaveBeenCalledWith(editorMock);
    expect(superdocStub.setActiveEditor).toHaveBeenCalledWith(editorMock);
    expect(superdocStub.broadcastEditorCreate).toHaveBeenCalled();
    expect(useAiMock).toHaveBeenCalled();

    options.onSelectionUpdate({
      editor: editorMock,
      transaction: { selection: { $from: { pos: 1 }, $to: { pos: 3 } } },
    });
    expect(useSelectionMock).toHaveBeenCalled();

    options.onCommentsUpdate({ activeCommentId: 'c1', type: 'trackedChange' });
    expect(commentsStoreStub.handleTrackedChangeUpdate).toHaveBeenCalled();
    await nextTick();
    expect(commentsStoreStub.setActiveComment).toHaveBeenCalledWith(superdocStub, 'c1');

    options.onCollaborationReady({ editor: editorMock });
    expect(superdocStub.emit).toHaveBeenCalledWith('collaboration-ready', { editor: editorMock });
    await nextTick();
    expect(superdocStoreStub.isReady.value).toBe(true);

    options.onDocumentLocked({ editor: editorMock, isLocked: true, lockedBy: { name: 'A' } });
    expect(superdocStub.lockSuperdoc).toHaveBeenCalledWith(true, { name: 'A' });

    options.onException({ error: new Error('boom'), editor: editorMock });
    expect(superdocStub.emit).toHaveBeenCalledWith('exception', { error: expect.any(Error), editor: editorMock });
  });

  it('handles replay comment update/delete events and triggers tracked-change resync', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const existingComment = { commentId: 'c-1', commentText: 'Old text' };

    commentsStoreStub.getComment.mockImplementation((id) => (id === 'c-1' ? existingComment : null));
    commentsStoreStub.commentsList.value = [
      existingComment,
      { commentId: 'c-2', parentCommentId: 'c-1', commentText: 'Reply' },
      { commentId: 'tc-child', trackedChangeParentId: 'c-1', commentText: 'Tracked thread comment' },
    ];
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    options.onCommentsUpdate({
      type: 'update',
      comment: { commentId: 'c-1', commentText: 'Updated text' },
    });
    expect(existingComment.commentText).toBe('Updated text');

    options.onCommentsUpdate({
      type: 'deleted',
      comment: { commentId: 'c-1' },
    });
    expect(commentsStoreStub.commentsList.value).toEqual([]);

    options.onCommentsUpdate({ type: 'replayCompleted' });
    await nextTick();
    expect(commentsStoreStub.syncTrackedChangeComments).toHaveBeenCalledWith({
      superdoc: superdocStub,
      editor: superdocStub.activeEditor,
    });
    commentsStoreStub.syncTrackedChangeComments.mockClear();

    options.onCommentLocationsUpdate({ allCommentPositions: { 'tc-new': { start: 1, end: 2 } } });
    expect(commentsStoreStub.syncTrackedChangeComments).not.toHaveBeenCalled();
  });

  it('reconciles replay updates by importedId before commentId to avoid duplicate comments', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();
    const { default: useComment } = await import('./components/CommentsLayer/use-comment.js');

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const existingComment = useComment({
      commentId: 'old-runtime-id',
      importedId: 'imp-1',
      commentText: 'Old text',
      fileId: 'doc-1',
      creatorEmail: 'ada@example.com',
      creatorName: 'Ada',
    });
    const otherDocumentComment = {
      commentId: 'doc2-id',
      importedId: 'imp-1',
      commentText: 'Doc 2 text',
      fileId: 'doc-2',
    };

    // Keep the non-active-document comment first to ensure active selection does
    // not fall back to global importedId matching.
    commentsStoreStub.commentsList.value = [otherDocumentComment, existingComment];
    commentsStoreStub.addComment.mockClear();
    commentsStoreStub.setActiveComment.mockClear();
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    options.onCommentsUpdate({
      type: 'update',
      comment: {
        commentId: 'new-runtime-id',
        importedId: 'imp-1',
        commentText: 'Updated text',
      },
    });
    await nextTick();

    expect(commentsStoreStub.addComment).not.toHaveBeenCalled();
    expect(commentsStoreStub.commentsList.value).toHaveLength(2);
    expect(existingComment.commentId).toBe('old-runtime-id');
    expect(existingComment.importedId).toBe('imp-1');
    expect(existingComment.getValues().commentId).toBe('old-runtime-id');
    expect(existingComment.getValues().importedId).toBe('imp-1');
    expect(existingComment.commentText).toBe('Updated text');
    expect(otherDocumentComment.commentId).toBe('doc2-id');
    expect(otherDocumentComment.commentText).toBe('Doc 2 text');
    expect(commentsStoreStub.setActiveComment).not.toHaveBeenCalled();
  });

  it('updates docxCommentJSON from replayed elements for imported comments', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();
    const { default: useComment } = await import('./components/CommentsLayer/use-comment.js');

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const existingComment = useComment({
      commentId: 'old-runtime-id',
      importedId: 'imp-1',
      commentText: 'Old text',
      fileId: 'doc-1',
      docxCommentJSON: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }],
      creatorEmail: 'ada@example.com',
      creatorName: 'Ada',
    });
    commentsStoreStub.commentsList.value = [existingComment];
    commentsStoreStub.addComment.mockClear();
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    const updatedElements = [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }];
    options.onCommentsUpdate({
      type: 'update',
      comment: {
        commentId: 'new-runtime-id',
        importedId: 'imp-1',
        text: 'Updated text',
        elements: updatedElements,
      },
    });

    expect(commentsStoreStub.addComment).not.toHaveBeenCalled();
    expect(existingComment.commentText).toBe('Updated text');
    expect(existingComment.docxCommentJSON).toEqual(updatedElements);
  });

  it('updates replayed parent linkage fields for existing comments', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();
    const { default: useComment } = await import('./components/CommentsLayer/use-comment.js');

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const existingComment = useComment({
      commentId: 'reply-1',
      importedId: 'imp-reply-1',
      parentCommentId: 'parent-old',
      trackedChangeParentId: 'tc-parent-old',
      fileId: 'doc-1',
      commentText: 'Reply',
      creatorEmail: 'ada@example.com',
      creatorName: 'Ada',
    });
    commentsStoreStub.commentsList.value = [existingComment];
    commentsStoreStub.addComment.mockClear();
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    options.onCommentsUpdate({
      type: 'update',
      comment: {
        commentId: 'reply-1',
        importedId: 'imp-reply-1',
        parentCommentId: 'parent-new',
        trackedChangeParentId: 'tc-parent-new',
        threadingParentCommentId: 'thread-parent-new',
      },
    });

    expect(commentsStoreStub.addComment).not.toHaveBeenCalled();
    expect(existingComment.parentCommentId).toBe('parent-new');
    expect(existingComment.trackedChangeParentId).toBe('tc-parent-new');
    expect(existingComment.threadingParentCommentId).toBe('thread-parent-new');
  });

  it('maps replayed isDone updates to resolved fields when explicit resolved metadata is missing', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();
    const { default: useComment } = await import('./components/CommentsLayer/use-comment.js');

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const existingComment = useComment({
      commentId: 'c-1',
      importedId: 'imp-1',
      commentText: 'Old text',
      fileId: 'doc-1',
      creatorEmail: 'ada@example.com',
      creatorName: 'Ada',
      resolvedTime: null,
      resolvedByEmail: null,
      resolvedByName: null,
    });
    commentsStoreStub.commentsList.value = [existingComment];
    commentsStoreStub.addComment.mockClear();
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    options.onCommentsUpdate({
      type: 'update',
      comment: {
        commentId: 'c-1',
        importedId: 'imp-1',
        isDone: true,
        resolvedTime: null,
        resolvedByEmail: null,
        resolvedByName: null,
        creatorEmail: 'imported@example.com',
        creatorName: 'Imported Author',
      },
    });

    expect(commentsStoreStub.addComment).not.toHaveBeenCalled();
    expect(existingComment.resolvedTime).not.toBeNull();
    expect(existingComment.resolvedByEmail).toBe('imported@example.com');
    expect(existingComment.resolvedByName).toBe('Imported Author');

    options.onCommentsUpdate({
      type: 'update',
      comment: {
        commentId: 'c-1',
        importedId: 'imp-1',
        isDone: false,
      },
    });

    expect(existingComment.resolvedTime).toBeNull();
    expect(existingComment.resolvedByEmail).toBeNull();
    expect(existingComment.resolvedByName).toBeNull();
  });

  it('maps replay-added elements to docxCommentJSON for imported comments', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.addComment.mockClear();

    const addedElements = [{ type: 'paragraph', content: [{ type: 'text', text: 'added' }] }];
    options.onCommentsUpdate({
      type: 'add',
      comment: {
        commentId: 'new-add-id',
        importedId: 'imp-add',
        text: 'Added text',
        elements: addedElements,
      },
    });

    expect(commentsStoreStub.addComment).toHaveBeenCalledTimes(1);
    const [{ comment: addedComment }] = commentsStoreStub.addComment.mock.calls[0];
    expect(addedComment.commentText).toBe('Added text');
    expect(addedComment.docxCommentJSON).toEqual(addedElements);
  });

  it('does not drop replay add when same id exists only in another document', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.commentsList.value = [
      { commentId: 'shared-id', importedId: 'shared-imported-id', fileId: 'doc-2', commentText: 'Doc 2 comment' },
    ];
    commentsStoreStub.getComment.mockImplementation((id) =>
      commentsStoreStub.commentsList.value.find((comment) => comment.commentId === id || comment.importedId === id),
    );
    commentsStoreStub.addComment.mockClear();
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    options.onCommentsUpdate({
      type: 'add',
      comment: {
        commentId: 'shared-id',
        importedId: 'shared-imported-id',
        commentText: 'Doc 1 replay add',
      },
    });

    expect(commentsStoreStub.addComment).toHaveBeenCalledTimes(1);
    const [{ comment: addedComment }] = commentsStoreStub.addComment.mock.calls[0];
    expect(addedComment.commentId).toBe('shared-id');
    expect(addedComment.importedId).toBe('shared-imported-id');
    expect(addedComment.fileId).toBe('doc-1');
  });

  it('removes replay-deleted comments when payload commentId is stale but importedId matches', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.commentsList.value = [
      { commentId: 'live-runtime-id', importedId: 'imp-1', commentText: 'Parent' },
      { commentId: 'child-1', parentCommentId: 'live-runtime-id', commentText: 'Reply' },
      { commentId: 'other', commentText: 'Unrelated' },
    ];
    commentsStoreStub.activeComment.value = 'child-1';
    commentsStoreStub.setActiveComment.mockClear();

    options.onCommentsUpdate({
      type: 'deleted',
      comment: { commentId: 'stale-runtime-id', importedId: 'imp-1' },
    });

    expect(commentsStoreStub.commentsList.value).toEqual([{ commentId: 'other', commentText: 'Unrelated' }]);
    await nextTick();
    expect(commentsStoreStub.setActiveComment).toHaveBeenCalledWith(superdocStub, null);
  });

  it('clears active comment when replay deletion removes the active reply', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.commentsList.value = [
      { commentId: 'c-1', commentText: 'Parent' },
      { commentId: 'c-2', parentCommentId: 'c-1', commentText: 'Reply' },
    ];
    commentsStoreStub.activeComment.value = 'c-2';
    commentsStoreStub.setActiveComment.mockClear();

    options.onCommentsUpdate({
      type: 'deleted',
      comment: { commentId: 'c-1' },
    });

    expect(commentsStoreStub.commentsList.value).toEqual([]);
    await nextTick();
    expect(commentsStoreStub.setActiveComment).toHaveBeenCalledWith(superdocStub, null);
  });

  it('removes full reply subtree when replay deletion removes a parent comment', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.commentsList.value = [
      { commentId: 'c-1', commentText: 'Parent' },
      { commentId: 'c-2', parentCommentId: 'c-1', commentText: 'Child' },
      { commentId: 'c-3', parentCommentId: 'c-2', commentText: 'Grandchild' },
      { commentId: 'c-4', trackedChangeParentId: 'c-3', commentText: 'Tracked descendant' },
      { commentId: 'c-99', commentText: 'Unrelated' },
    ];
    commentsStoreStub.activeComment.value = 'c-3';
    commentsStoreStub.setActiveComment.mockClear();

    options.onCommentsUpdate({
      type: 'deleted',
      comment: { commentId: 'c-1' },
    });

    expect(commentsStoreStub.commentsList.value).toEqual([{ commentId: 'c-99', commentText: 'Unrelated' }]);
    await nextTick();
    expect(commentsStoreStub.setActiveComment).toHaveBeenCalledWith(superdocStub, null);
  });

  it('scopes replay deletion subtree to the active document when IDs overlap across documents', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.commentsList.value = [
      { commentId: 'c-1', importedId: 'imp-1', fileId: 'doc-1', commentText: 'Doc 1 parent' },
      { commentId: 'c-2', parentCommentId: 'c-1', fileId: 'doc-1', commentText: 'Doc 1 child' },
      { commentId: 'c-1', importedId: 'imp-1', fileId: 'doc-2', commentText: 'Doc 2 parent' },
      { commentId: 'c-3', parentCommentId: 'c-1', fileId: 'doc-2', commentText: 'Doc 2 child' },
    ];
    commentsStoreStub.activeComment.value = 'c-3';
    commentsStoreStub.setActiveComment.mockClear();
    superdocStub.activeEditor = { options: { documentId: 'doc-1' } };

    options.onCommentsUpdate({
      type: 'deleted',
      comment: { commentId: 'c-1', importedId: 'imp-1' },
    });

    expect(commentsStoreStub.commentsList.value).toEqual([
      { commentId: 'c-1', importedId: 'imp-1', fileId: 'doc-2', commentText: 'Doc 2 parent' },
      { commentId: 'c-3', parentCommentId: 'c-1', fileId: 'doc-2', commentText: 'Doc 2 child' },
    ]);
    await nextTick();
    expect(commentsStoreStub.setActiveComment).not.toHaveBeenCalledWith(superdocStub, null);
  });

  it('passes slash menu and context menu options through to SuperEditor', async () => {
    const superdocStub = createSuperdocStub();
    const slashMenuConfig = {
      includeDefaultItems: false,
      items: [{ id: 'custom-section', items: [{ id: 'custom-item', label: 'Custom Item', action: vi.fn() }] }],
    };
    superdocStub.config.modules.slashMenu = slashMenuConfig;
    superdocStub.config.disableContextMenu = true;

    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    expect(options.slashMenuConfig).toBe(slashMenuConfig);
    expect(options.disableContextMenu).toBe(true);
  });

  it('handles editor-ready by storing presentation editor and syncing context menu disable state', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.disableContextMenu = true;
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const doc = superdocStoreStub.documents.value[0];
    doc.setPresentationEditor = vi.fn();

    const presentationEditor = {
      setContextMenuDisabled: vi.fn(),
      on: vi.fn(),
      getCommentBounds: vi.fn(() => ({})),
    };
    const editor = { options: { documentId: 'doc-1' } };
    wrapper.findComponent(SuperEditorStub).vm.$emit('editor-ready', { editor, presentationEditor });
    await nextTick();

    expect(doc.setPresentationEditor).toHaveBeenCalledWith(presentationEditor);
    expect(presentationEditor.setContextMenuDisabled).toHaveBeenCalledWith(true);
    expect(presentationEditor.on).toHaveBeenCalledWith('commentPositions', expect.any(Function));
  });

  it('forwards header/footer presentation events through the public update callbacks', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.onTransaction = vi.fn();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    superdocStoreStub.documents.value[0].setPresentationEditor = vi.fn();

    const listeners = {};
    const presentationEditor = {
      setContextMenuDisabled: vi.fn(),
      on: vi.fn((event, handler) => {
        listeners[event] = handler;
      }),
      getCommentBounds: vi.fn(() => ({})),
    };
    const bodyEditor = { options: { documentId: 'doc-1' } };
    const sourceEditor = { options: { documentId: 'header-doc' } };

    wrapper.findComponent(SuperEditorStub).vm.$emit('editor-ready', {
      editor: bodyEditor,
      presentationEditor,
    });
    await nextTick();

    listeners.headerFooterUpdate({
      editor: bodyEditor,
      sourceEditor,
      surface: 'header',
      headerId: 'rId-header-default',
      sectionType: 'default',
    });
    expect(superdocStub.emit).toHaveBeenCalledWith('editor-update', {
      editor: bodyEditor,
      sourceEditor,
      surface: 'header',
      headerId: 'rId-header-default',
      sectionType: 'default',
    });

    const transaction = { docChanged: true, getMeta: vi.fn(() => null) };
    listeners.headerFooterTransaction({
      editor: bodyEditor,
      sourceEditor,
      transaction,
      duration: 12,
      surface: 'footer',
      headerId: 'rId-footer-default',
      sectionType: 'default',
    });
    expect(superdocStub.config.onTransaction).toHaveBeenCalledWith({
      editor: bodyEditor,
      sourceEditor,
      transaction,
      duration: 12,
      surface: 'footer',
      headerId: 'rId-footer-default',
      sectionType: 'default',
    });
  });

  it('falls back to sourceEditor for body update and transaction payloads', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.onTransaction = vi.fn();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const bodyEditor = { options: { documentId: 'doc-1' } };
    const transaction = { docChanged: true, getMeta: vi.fn(() => null) };

    options.onUpdate({ sourceEditor: bodyEditor });
    expect(superdocStub.emit).toHaveBeenCalledWith('editor-update', {
      editor: bodyEditor,
      sourceEditor: bodyEditor,
      surface: 'body',
      headerId: null,
      sectionType: null,
    });

    options.onTransaction({
      sourceEditor: bodyEditor,
      transaction,
      duration: 7,
    });
    expect(superdocStub.config.onTransaction).toHaveBeenCalledWith({
      editor: bodyEditor,
      sourceEditor: bodyEditor,
      transaction,
      duration: 7,
      surface: 'body',
      headerId: null,
      sectionType: null,
    });
  });

  it('shows comments sidebar and tools, handles menu actions', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const editorMock = {
      options: { documentId: 'doc-1' },
      commands: {
        togglePagination: vi.fn(),
        insertAiMark: vi.fn(),
      },
      state: {
        doc: { content: { size: 100 } },
        selection: { $from: { pos: 1 }, $to: { pos: 6 } },
      },
      view: {
        coordsAtPos: vi.fn((pos) =>
          pos === 1 ? { top: 100, bottom: 140, left: 10, right: 30 } : { top: 120, bottom: 160, left: 70, right: 90 },
        ),
        state: { selection: { $from: { pos: 1 }, $to: { pos: 6 } } },
      },
      getPageStyles: vi.fn(() => ({ pageMargins: {} })),
    };

    // processSelectionChange needs layers to be non-null to proceed past the guard
    wrapper.vm.$.setupState.layers = document.createElement('div');

    await nextTick();
    options.onSelectionUpdate({
      editor: editorMock,
      transaction: { selection: { $from: { pos: 1 }, $to: { pos: 6 } } },
    });
    await nextTick();
    const setupState = wrapper.vm.$.setupState;
    setupState.toolsMenuPosition.top = '12px';
    setupState.toolsMenuPosition.right = '0px';
    superdocStoreStub.selectionPosition.value = {
      left: 10,
      right: 40,
      top: 20,
      bottom: 60,
      source: 'super-editor',
    };
    await nextTick();

    const handleToolClick = wrapper.vm.$.setupState.handleToolClick;
    handleToolClick('comments');
    expect(commentsStoreStub.showAddComment).toHaveBeenCalledWith(superdocStub, 20);

    handleToolClick('ai');
    const aiMockResult = useAiMock.mock.results.at(-1)?.value;
    expect(aiMockResult?.handleAiToolClick).toHaveBeenCalled();

    commentsStoreStub.pendingComment.value = { commentId: 'new', selection: { getValues: () => ({}) } };
    await nextTick();
    const toggleArg = superdocStub.broadcastSidebarToggle.mock.calls.at(-1)[0];
    expect(toggleArg).toEqual(expect.objectContaining({ commentId: 'new' }));
    // CommentDialog is now rendered inside FloatingComments, so check for that instead
    expect(wrapper.findComponent(FloatingCommentsStub).exists()).toBe(true);

    superdocStoreStub.isReady.value = true;
    await nextTick();
    commentsStoreStub.getFloatingComments.value = [{ id: 'f1' }];
    await nextTick();
    await nextTick();
    expect(commentsStoreStub.hasInitializedLocations.value).toBe(true);
  });

  it('hides comment interactions when comments module is disabled', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.modules.comments = false;

    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    superdocStoreStub.modules.comments = false;
    await nextTick();

    expect(wrapper.find('.superdoc__selection-layer').exists()).toBe(false);

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const editorMock = {
      options: { documentId: 'doc-1' },
      commands: { togglePagination: vi.fn() },
      view: {
        coordsAtPos: vi.fn(() => ({ top: 100, bottom: 140, left: 10, right: 30 })),
        state: { selection: { empty: true } },
      },
      getPageStyles: vi.fn(() => ({ pageMargins: {} })),
    };

    options.onSelectionUpdate({
      editor: editorMock,
      transaction: { selection: { $from: { pos: 1 }, $to: { pos: 4 } } },
    });
    await nextTick();

    expect(superdocStoreStub.activeSelection.value).toBeNull();
    expect(wrapper.find('.superdoc__tools').exists()).toBe(false);
  });

  it('shows floating comments after imported threads and positions load', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    commentsStoreStub.handleEditorLocationsUpdate.mockImplementation((positions) => {
      commentsStoreStub.getFloatingComments.value = Object.values(positions);
    });
    const importedComment = {
      commentId: null,
      importedId: 'import-1',
      documentId: 'doc-1',
      commentText: '<p>Imported</p>',
      createdTime: Date.now(),
    };

    options.onCommentsUpdate({ type: 'add', comment: importedComment });
    await nextTick();

    const { schema, doc } = createImportedCommentDoc('import-1');
    const { view, editor, pluginView } = createCommentsPluginEnvironment({ schema, doc });
    expect(pluginView).toBeDefined();

    view.coordsAtPos.mockReturnValue({ top: 20, bottom: 40, left: 10, right: 30 });
    editor.emit = vi.fn((event, payload) => {
      if (event === 'comment-positions') {
        options.onCommentLocationsUpdate({
          allCommentPositions: payload.allCommentPositions,
          allCommentIds: Object.keys(payload.allCommentPositions),
        });
      }
    });

    const forceTr = view.state.tr.setMeta(CommentsPluginKey, { type: 'force' });
    view.dispatch(forceTr);
    pluginView.update(view);

    expect(editor.emit).toHaveBeenCalledWith(
      'comment-positions',
      expect.objectContaining({
        allCommentPositions: expect.objectContaining({
          'import-1': expect.objectContaining({
            bounds: expect.objectContaining({ top: 20, left: 10 }),
          }),
        }),
      }),
    );
    expect(commentsStoreStub.handleEditorLocationsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        'import-1': expect.objectContaining({ threadId: 'import-1' }),
      }),
      expect.arrayContaining(['import-1']),
    );

    await nextTick();
    superdocStoreStub.isReady.value = true;
    await nextTick();

    expect(wrapper.vm.showCommentsSidebar).toBe(true);
    expect(wrapper.find('.floating-comments').exists()).toBe(true);
  });

  it('hides floating comments sidebar entirely in viewing mode even with comment positions', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.documentMode = 'viewing';
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    commentsStoreStub.getFloatingComments.value = [{ commentId: 'c-1' }];
    commentsStoreStub.hasInitializedLocations.value = true;
    superdocStoreStub.isReady.value = true;
    await nextTick();

    expect(wrapper.vm.showCommentsSidebar).toBe(false);
    expect(wrapper.find('.superdoc__right-sidebar').exists()).toBe(false);
  });

  it('ignores comment location updates while in viewing mode', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.documentMode = 'viewing';
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    options.onCommentLocationsUpdate({
      allCommentPositions: {
        'comment-1': { threadId: 'comment-1', bounds: { top: 10, left: 5, right: 20, bottom: 30 } },
      },
      allCommentIds: ['comment-1'],
    });
    await nextTick();

    expect(commentsStoreStub.handleEditorLocationsUpdate).not.toHaveBeenCalled();
    expect(commentsStoreStub.clearEditorCommentPositions).toHaveBeenCalled();
  });

  it('forwards empty comment position payloads to store-level guard', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    options.onCommentLocationsUpdate({
      allCommentPositions: {},
      allCommentIds: [],
    });
    await nextTick();

    expect(commentsStoreStub.handleEditorLocationsUpdate).toHaveBeenCalledWith({}, []);
  });

  it('clears PDF selections when viewing mode is active to keep tools hidden', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.documentMode = 'viewing';
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const setupState = wrapper.vm.$.setupState;
    setupState.toolsMenuPosition.top = '120px';
    superdocStoreStub.selectionPosition.value = {
      left: 5,
      right: 25,
      top: 50,
      bottom: 90,
      source: 'pdf',
    };
    await nextTick();

    expect(wrapper.vm.showToolsFloatingMenu).toBeTruthy();

    setupState.handleSelectionChange({
      selectionBounds: { top: 10, left: 10, right: 20, bottom: 30 },
      source: 'pdf',
    });
    await nextTick();

    expect(superdocStoreStub.selectionPosition.value).toBeNull();
    expect(setupState.toolsMenuPosition.top).toBeNull();
    expect(wrapper.vm.showToolsFloatingMenu).toBeFalsy();
  });

  it('does not crash when selectionUpdate carries stale positions after new file insert', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const editorMock = {
      options: { documentId: 'doc-1' },
      view: {
        coordsAtPos: vi.fn((pos) => {
          if (pos > 5) {
            throw new RangeError('Position out of range');
          }
          return { top: pos, bottom: pos + 10, left: 0, right: 0 };
        }),
        state: { selection: { $from: { pos: 1 }, $to: { pos: 1 }, empty: false } },
      },
      getPageStyles: vi.fn(() => ({ pageMargins: {} })),
    };

    const triggerSelectionUpdate = () =>
      options.onSelectionUpdate({
        editor: editorMock,
        // Simulate a stale transaction selection that is past the new doc length
        transaction: { selection: { $from: { pos: 10 }, $to: { pos: 10 } } },
      });

    expect(triggerSelectionUpdate).not.toThrow();
  });

  // Note: The handlePresentationEditorReady test was removed because that function
  // no longer exists. PresentationEditor now registers itself automatically in the
  // constructor and manages zoom/layout data internally.

  it('clears selection updates in viewing mode to keep the tools bubble hidden', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.documentMode = 'viewing';
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const setupState = wrapper.vm.$.setupState;
    setupState.toolsMenuPosition.top = '100px';
    superdocStoreStub.selectionPosition.value = {
      left: 10,
      right: 40,
      top: 50,
      bottom: 70,
      source: 'super-editor',
    };
    await nextTick();

    expect(wrapper.vm.showToolsFloatingMenu).toBeTruthy();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const editorMock = { options: { documentId: 'doc-1' } };

    options.onSelectionUpdate({
      editor: editorMock,
      transaction: { selection: { $from: { pos: 1 }, $to: { pos: 1 } } },
    });
    await nextTick();

    expect(superdocStoreStub.selectionPosition.value).toBeNull();
    expect(setupState.toolsMenuPosition.top).toBeNull();
    expect(wrapper.vm.showToolsFloatingMenu).toBeFalsy();
  });

  it('ignores queued RAF selection work if mode switches to viewing before frame runs', async () => {
    const rafQueue = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      rafQueue[id - 1] = null;
    });

    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const editorMock = {
      options: { documentId: 'doc-1' },
      state: {
        doc: { content: { size: 10 } },
        selection: { $from: { pos: 1 }, $to: { pos: 6 } },
      },
      view: {
        state: {
          doc: { content: { size: 10 } },
          selection: { $from: { pos: 1 }, $to: { pos: 6 } },
        },
        coordsAtPos: vi.fn((pos) =>
          pos === 1 ? { top: 100, bottom: 140, left: 10, right: 30 } : { top: 120, bottom: 160, left: 70, right: 90 },
        ),
      },
    };

    useSelectionMock.mockClear();
    options.onSelectionUpdate({ editor: editorMock });

    expect(rafQueue).toHaveLength(1);

    superdocStub.config.documentMode = 'viewing';
    rafQueue[0](Date.now());
    await nextTick();

    expect(useSelectionMock).not.toHaveBeenCalled();
    expect(superdocStoreStub.selectionPosition.value).toBeNull();
    expect(wrapper.vm.showToolsFloatingMenu).toBeFalsy();
  });

  it('hides tools bubble when selection is cleared (SD-1241)', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const options = wrapper.findComponent(SuperEditorStub).props('options');
    const editorMock = {
      options: { documentId: 'doc-1' },
      commands: { togglePagination: vi.fn() },
      view: {
        coordsAtPos: vi.fn((pos) =>
          pos === 1 ? { top: 100, bottom: 140, left: 10, right: 30 } : { top: 120, bottom: 160, left: 70, right: 90 },
        ),
        state: { selection: { empty: true } },
      },
      getPageStyles: vi.fn(() => ({ pageMargins: {} })),
    };

    // First, make a selection to show the tools menu
    options.onSelectionUpdate({
      editor: editorMock,
      transaction: { selection: { $from: { pos: 1 }, $to: { pos: 6 } } },
    });
    await nextTick();

    const setupState = wrapper.vm.$.setupState;
    setupState.toolsMenuPosition.top = '100px';
    setupState.toolsMenuPosition.right = '0px';
    superdocStoreStub.selectionPosition.value = {
      left: 10,
      right: 90,
      top: 100,
      bottom: 160,
      source: 'super-editor',
    };
    await nextTick();

    // Verify tools menu is visible
    expect(wrapper.vm.showToolsFloatingMenu).toBe(true);

    // Clear the selection (simulating cursor change/deselection)
    setupState.resetSelection();
    await nextTick();

    // Verify both selectionPosition and toolsMenuPosition.top are cleared
    expect(superdocStoreStub.selectionPosition.value).toBeNull();
    expect(setupState.toolsMenuPosition.top).toBeNull();

    // Verify tools menu is now hidden (computed returns falsy value)
    expect(wrapper.vm.showToolsFloatingMenu).toBeFalsy();
  });

  it('showToolsFloatingMenu returns falsy when selectionPosition is null even if toolsMenuPosition.top is set', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const setupState = wrapper.vm.$.setupState;

    // Set toolsMenuPosition.top but leave selectionPosition null
    setupState.toolsMenuPosition.top = '100px';
    superdocStoreStub.selectionPosition.value = null;
    await nextTick();

    // Tools menu should be hidden because selectionPosition is null
    expect(wrapper.vm.showToolsFloatingMenu).toBeFalsy();
  });

  it('hides tools bubble when updateSelection receives no coordinates', async () => {
    const superdocStub = createSuperdocStub();
    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const setupState = wrapper.vm.$.setupState;

    // Set up initial state with selection and tools menu visible
    setupState.toolsMenuPosition.top = '100px';
    superdocStoreStub.selectionPosition.value = {
      left: 10,
      right: 90,
      top: 100,
      bottom: 160,
      source: 'super-editor',
    };
    await nextTick();

    expect(wrapper.vm.showToolsFloatingMenu).toBeTruthy();

    // Call updateSelection with no coordinates (simulates deselection)
    setupState.updateSelection({});
    await nextTick();

    // Both should be cleared
    expect(superdocStoreStub.selectionPosition.value).toBeNull();
    expect(setupState.toolsMenuPosition.top).toBeNull();
    expect(wrapper.vm.showToolsFloatingMenu).toBeFalsy();
  });

  it('merges partial trackChangeActiveHighlightColors with base colors', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.modules.comments = {
      trackChangeHighlightColors: {
        insertBorder: '#00ff00',
        deleteBackground: '#0000ff',
      },
      trackChangeActiveHighlightColors: {
        insertBorder: '#ff0000', // only override this one
      },
    };

    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const styleVars = wrapper.vm.superdocStyleVars;

    // Active insertBorder should be overridden
    expect(styleVars['--sd-track-insert-border']).toBe('#ff0000');
    // deleteBackground should be inherited from base config
    expect(styleVars['--sd-track-delete-bg']).toBe('#0000ff');
  });

  it('sets track change CSS vars from base config when no active config provided', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.modules.comments = {
      trackChangeHighlightColors: {
        insertBorder: '#11ff11',
        deleteBorder: '#ff1111',
        formatBorder: '#1111ff',
      },
    };

    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const styleVars = wrapper.vm.superdocStyleVars;

    expect(styleVars['--sd-track-insert-border']).toBe('#11ff11');
    expect(styleVars['--sd-track-delete-border']).toBe('#ff1111');
    expect(styleVars['--sd-track-format-border']).toBe('#1111ff');
  });

  it('sets comment highlight hover color CSS var', async () => {
    const superdocStub = createSuperdocStub();
    superdocStub.config.modules.comments = {
      highlightHoverColor: '#abcdef88',
    };

    const wrapper = await mountComponent(superdocStub);
    await nextTick();

    const styleVars = wrapper.vm.superdocStyleVars;
    expect(styleVars['--sd-comment-highlight-hover']).toBe('#abcdef88');
  });
});
