import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOCX, PDF } from '@superdoc/common';
import { createFakeV1Runtime } from './editor-runtime/conformance/fake-v1-runtime.js';
import { createV1EditorRuntimeAdapter } from './editor-runtime/v1/v1-editor-runtime-adapter.js';
import { markRuntimeRoot } from './editor-runtime/root-marker.js';

// Mock must be defined before imports that use it
vi.mock('@superdoc/common/collaboration/awareness', () => ({
  shuffleArray: vi.fn((arr) => [...arr].reverse()),
}));

// Import the mocked module to access the mock
import { shuffleArray as shuffleArrayMock } from '@superdoc/common/collaboration/awareness';

const uuidMock = vi.fn(() => 'uuid-1234');
vi.mock('uuid', () => ({
  v4: uuidMock,
}));

const toolbarUpdateSpy = vi.fn();
const toolbarSetActiveSpy = vi.fn();

class MockToolbar {
  constructor(config) {
    this.config = config;
    this.listeners = {};
    this.activeEditor = null;
    this.updateToolbarState = toolbarUpdateSpy;
    this.destroy = vi.fn();
    this._boundTransaction = null;
  }

  on(event, handler) {
    this.listeners[event] = handler;
  }

  once(event, handler) {
    this.listeners[event] = handler;
  }

  setActiveEditor(editor) {
    if (this.activeEditor && this._boundTransaction && typeof this.activeEditor.off === 'function') {
      this.activeEditor.off('transaction', this._boundTransaction);
      this._boundTransaction = null;
    }
    this.activeEditor = editor;
    toolbarSetActiveSpy(editor);
    if (editor && typeof editor.on === 'function') {
      this._boundTransaction = () => this.updateToolbarState();
      editor.on('transaction', this._boundTransaction);
    }
  }
}

const createZipMock = vi.fn(async (blobs, names) => ({ zip: true, blobs, names }));

vi.mock('@superdoc/super-editor', () => ({
  SuperToolbar: MockToolbar,
  createZip: createZipMock,
}));

const superCommentsConstructor = vi.fn();
vi.mock('../components/CommentsLayer/commentsList/super-comments-list.js', () => ({
  SuperComments: superCommentsConstructor,
}));

const createDownloadMock = vi.fn(() => 'downloaded');
const cleanNameMock = vi.fn((value) => value.replace(/\s+/g, '-'));

vi.mock('./helpers/export.js', () => ({
  createDownload: createDownloadMock,
  cleanName: cleanNameMock,
}));

const initSuperdocYdocMock = vi.fn(() => ({
  ydoc: { destroy: vi.fn() },
  provider: { disconnect: vi.fn(), destroy: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
const initCollaborationCommentsMock = vi.fn();
const makeDocumentsCollaborativeMock = vi.fn((superdoc) => {
  return superdoc.config.documents.map((doc, index) => {
    const provider = { disconnect: vi.fn(), destroy: vi.fn() };
    const ydoc = {
      destroyed: false,
      destroy: vi.fn(),
      getMap: vi.fn(() => ({
        set: vi.fn(),
        observe: vi.fn(),
      })),
      transact: (fn) => fn(),
    };

    Object.assign(doc, {
      id: doc.id || `doc-${index}`,
      provider,
      ydoc,
      socket: superdoc.config.socket,
    });

    return doc;
  });
});

vi.mock('./collaboration/helpers.js', () => ({
  initSuperdocYdoc: initSuperdocYdocMock,
  initCollaborationComments: initCollaborationCommentsMock,
  makeDocumentsCollaborative: makeDocumentsCollaborativeMock,
}));

class MockHocuspocusProviderWebsocket {
  constructor(config) {
    this.config = config;
    this.on = vi.fn();
    this.off = vi.fn();
    this.disconnect = vi.fn();
    this.destroy = vi.fn();
    this.cancelWebsocketRetry = vi.fn();
    MockHocuspocusProviderWebsocket.instances.push(this);
  }

  static instances = [];
  static mockClear() {
    MockHocuspocusProviderWebsocket.instances = [];
  }
}
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProviderWebsocket: MockHocuspocusProviderWebsocket,
}));

const createVueAppMock = vi.fn();

vi.mock('./create-app.js', () => ({
  createSuperdocVueApp: createVueAppMock,
}));

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createAppHarness = () => {
  const superdocStore = {
    documents: [],
    init: vi.fn(),
    reset: vi.fn(),
    setExceptionHandler: vi.fn(),
    activeZoom: 100,
    zoomMode: 'manual',
    viewportMetrics: null,
  };

  const commentsStore = {
    init: vi.fn(),
    translateCommentsForExport: vi.fn(() => []),
    handleEditorLocationsUpdate: vi.fn(),
    hasSyncedCollaborationComments: false,
    commentsParentElement: null,
    editorCommentIds: [],
    removePendingComment: vi.fn(),
    setActiveComment: vi.fn(),
  };

  const app = {
    mount: vi.fn(),
    unmount: vi.fn(),
    provide: vi.fn(),
    config: { globalProperties: {} },
  };

  const pinia = {};
  const highContrastModeStore = {};

  createVueAppMock.mockReturnValue({ app, pinia, superdocStore, commentsStore, highContrastModeStore });

  return { app, superdocStore, commentsStore };
};

const originalCreateElement = document.createElement;
let consoleDebugSpy;
let consoleLogSpy;

describe('SuperDoc core', () => {
  let SuperDoc;

  beforeEach(async () => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.resetModules();
    toolbarUpdateSpy.mockClear();
    toolbarSetActiveSpy.mockClear();
    createZipMock.mockClear();
    createDownloadMock.mockClear();
    cleanNameMock.mockClear();
    shuffleArrayMock.mockClear();
    makeDocumentsCollaborativeMock.mockClear();
    initSuperdocYdocMock.mockClear();
    initCollaborationCommentsMock.mockClear();
    MockHocuspocusProviderWebsocket.mockClear();
    superCommentsConstructor.mockClear();

    document.body.innerHTML = '<div id="host"></div>';

    ({ SuperDoc } = await import('./SuperDoc.js'));
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    consoleDebugSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('normalizes document and mounts app', async () => {
    const { app, superdocStore } = createAppHarness();
    const config = {
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red', 'blue'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    };

    const instance = new SuperDoc(config);
    await flushMicrotasks();

    expect(createVueAppMock).toHaveBeenCalledWith({ disablePiniaDevtools: false });
    // Vue mounts on a child wrapper element inside the user's container (SD-1832)
    const mountArg = app.mount.mock.calls[0][0];
    expect(mountArg).toBeInstanceOf(HTMLDivElement);
    expect(mountArg.parentElement).toBe(document.querySelector('#host'));
    expect(superdocStore.init).toHaveBeenCalledWith(instance.config);
    expect(instance.config.documents).toHaveLength(1);
    expect(instance.config.documents[0]).toMatchObject({ type: DOCX, url: 'https://example.com/doc.docx' });
    expect(instance.colors).toEqual(['blue', 'red']);
    expect(shuffleArrayMock).toHaveBeenCalledWith(['red', 'blue']);
  });

  it('passes disablePiniaDevtools option to createSuperdocVueApp', async () => {
    createAppHarness();

    new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      disablePiniaDevtools: true,
      onException: vi.fn(),
    });

    await flushMicrotasks();

    expect(createVueAppMock).toHaveBeenCalledWith({ disablePiniaDevtools: true });
  });

  it('defaults comments module config when omitted', async () => {
    const { commentsStore } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(Object.prototype.hasOwnProperty.call(instance.config.modules, 'comments')).toBe(true);
    expect(instance.config.modules.comments).toMatchObject({});
    expect(commentsStore.init).toHaveBeenCalledWith({});
  });

  it('falls back to hidden comments when top-level comments config is null', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      comments: null,
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(instance.config.comments).toEqual({ visible: false });
  });

  it('relays store exception payloads through the public exception event', async () => {
    const { superdocStore } = createAppHarness();
    const onException = vi.fn();

    new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onException,
    });
    await flushMicrotasks();

    const handler = superdocStore.setExceptionHandler.mock.calls[0][0];
    const payload = { error: 'raw store failure', document: null, stage: 'document-init' };
    handler(payload);

    expect(onException).toHaveBeenCalledWith(payload);
  });

  it('forwards raw content errors with document id and source file', async () => {
    const { superdocStore } = createAppHarness();
    const onContentError = vi.fn();
    const sourceFile = new Blob(['docx'], { type: DOCX });

    superdocStore.documents = [{ id: 'doc-1', data: sourceFile }];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onContentError,
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const error = 'raw editor failure';
    const editor = { options: { documentId: 'doc-1' } };
    instance.onContentError({ error, editor });

    expect(onContentError).toHaveBeenCalledWith({
      error,
      editor,
      documentId: 'doc-1',
      file: sourceFile,
    });
  });

  it('keeps toolbarGroups separate from toolbar group item mappings', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: {},
        toolbar: {
          groups: { custom: ['bold', 'italic'] },
        },
      },
      toolbarGroups: ['left', 'custom'],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(instance.toolbar.config.toolbarGroups).toEqual(['left', 'custom']);
    expect(instance.toolbar.config.groups).toEqual({ custom: ['bold', 'italic'] });
  });

  it('keeps valid compact comments policy fields', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: {
          displayMode: 'inline',
          compactBreakpointPx: 760,
          compactMeasurementSelector: '  #shell-main  ',
        },
        toolbar: {},
      },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(instance.config.modules.comments).toMatchObject({
      displayMode: 'inline',
      compactBreakpointPx: 760,
      compactMeasurementSelector: '#shell-main',
    });
  });

  it('normalizes invalid compact comments policy fields', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: {
          displayMode: 'unexpected-mode',
          compactBreakpointPx: -10,
          compactMeasurementSelector: '   ',
        },
        toolbar: {},
      },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(instance.config.modules.comments.displayMode).toBeUndefined();
    expect(instance.config.modules.comments.compactBreakpointPx).toBeUndefined();
    expect(instance.config.modules.comments.compactMeasurementSelector).toBeUndefined();
  });

  it('creates a default user when none is provided', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
    });

    await flushMicrotasks();

    expect(instance.config.user).toEqual(expect.objectContaining({ name: 'Default SuperDoc user', email: null }));
    expect(instance.user).toEqual(expect.objectContaining({ name: 'Default SuperDoc user', email: null }));
  });

  it('falls back to the default user when config.user is null', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      user: null,
      onException: vi.fn(),
    });

    await flushMicrotasks();

    expect(instance.config.user).toEqual(expect.objectContaining({ name: 'Default SuperDoc user', email: null }));
    expect(instance.user).toEqual(expect.objectContaining({ name: 'Default SuperDoc user', email: null }));
  });

  it('keeps legacy default-user behavior for an explicitly empty user name', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      user: { name: '', email: null },
    });

    await flushMicrotasks();

    expect(instance.config.user).toEqual(expect.objectContaining({ name: 'Default SuperDoc user', email: null }));
    expect(instance.user).toEqual(expect.objectContaining({ name: 'Default SuperDoc user', email: null }));
  });

  it('scrolls to a comment and sets it active', async () => {
    const { commentsStore } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const target = document.createElement('div');
    target.setAttribute('data-comment-ids', 'comment-1');
    target.scrollIntoView = vi.fn();
    document.querySelector('#host').appendChild(target);

    const result = instance.scrollToComment('comment-1');
    expect(result).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(commentsStore.setActiveComment).toHaveBeenCalledWith(instance, 'comment-1');
  });

  it('returns false when comment element is not found', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(instance.scrollToComment('nonexistent-id')).toBe(false);
  });

  it('forwards navigateTo to the first presentation editor', async () => {
    const { superdocStore } = createAppHarness();
    const navigateTo = vi.fn(async () => true);

    superdocStore.documents = [
      {
        getPresentationEditor: vi.fn(() => ({ navigateTo })),
      },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const target = {
      kind: 'entity',
      entityType: 'bookmark',
      name: 'bookmark-1',
      story: { kind: 'story', storyType: 'body' },
    };

    await expect(instance.navigateTo(target)).resolves.toBe(true);
    expect(navigateTo).toHaveBeenCalledWith(target);
  });

  it('returns false from navigateTo when presentation navigation is unavailable', async () => {
    const { superdocStore } = createAppHarness();
    superdocStore.documents = [
      {
        getPresentationEditor: vi.fn(() => null),
      },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(instance.navigateTo({ kind: 'block', nodeId: 'node-1' })).resolves.toBe(false);
  });

  it('forwards scrollToElement to the first presentation editor', async () => {
    const { superdocStore } = createAppHarness();
    const scrollToElement = vi.fn(async () => true);

    superdocStore.documents = [
      {
        getPresentationEditor: vi.fn(() => ({ scrollToElement })),
      },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(instance.scrollToElement('element-1')).resolves.toBe(true);
    expect(scrollToElement).toHaveBeenCalledWith('element-1');
  });

  it('returns false from scrollToElement when presentation navigation is unavailable', async () => {
    const { superdocStore } = createAppHarness();
    superdocStore.documents = [
      {
        getPresentationEditor: vi.fn(() => null),
      },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(instance.scrollToElement('element-1')).resolves.toBe(false);
  });

  // SD-3213f: narrow public methods that replaced the raw-store reach
  // for headless-toolbar host routing and tracked-change enrichment.
  // These methods are the public replacement for `superdoc.superdocStore.
  // documents[].getPresentationEditor()` and `superdoc.commentsStore.
  // getComment(id)` access that consumers used pre-hide. They must work
  // correctly (returning matched values, null on miss, null on invalid
  // input) and must not throw when the underlying stores are missing
  // their methods.
  describe('SD-3213f narrow host methods', () => {
    describe('getPresentationEditorForDocument', () => {
      it('returns the presentation editor for the matching documentId', async () => {
        const { superdocStore } = createAppHarness();
        const presentationEditor = { id: 'pe-1' };
        const bodyEditor = { options: { documentId: 'doc-1' } };
        superdocStore.documents = [
          {
            getEditor: vi.fn(() => bodyEditor),
            getPresentationEditor: vi.fn(() => presentationEditor),
          },
        ];

        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getPresentationEditorForDocument('doc-1')).toBe(presentationEditor);
      });

      it('returns null when no document matches the id', async () => {
        const { superdocStore } = createAppHarness();
        superdocStore.documents = [
          {
            getEditor: vi.fn(() => ({ options: { documentId: 'doc-1' } })),
            getPresentationEditor: vi.fn(() => ({ id: 'pe-1' })),
          },
        ];

        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getPresentationEditorForDocument('doc-other')).toBeNull();
      });

      it('returns null when the matched document has no presentation editor', async () => {
        const { superdocStore } = createAppHarness();
        superdocStore.documents = [
          {
            getEditor: vi.fn(() => ({ options: { documentId: 'doc-1' } })),
            getPresentationEditor: vi.fn(() => null),
          },
        ];

        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getPresentationEditorForDocument('doc-1')).toBeNull();
      });

      it('returns null for empty or non-string documentId', async () => {
        createAppHarness();
        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getPresentationEditorForDocument('')).toBeNull();
        expect(instance.getPresentationEditorForDocument(undefined)).toBeNull();
        expect(instance.getPresentationEditorForDocument(null)).toBeNull();
        expect(instance.getPresentationEditorForDocument(123)).toBeNull();
      });
    });

    describe('getComment', () => {
      it('delegates to commentsStore.getComment and returns the result', async () => {
        const { commentsStore } = createAppHarness();
        const storedComment = { id: 'c-1', body: 'hello' };
        commentsStore.getComment = vi.fn(() => storedComment);

        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getComment('c-1')).toBe(storedComment);
        expect(commentsStore.getComment).toHaveBeenCalledWith('c-1');
      });

      it('returns null when commentsStore returns no comment for the id', async () => {
        const { commentsStore } = createAppHarness();
        commentsStore.getComment = vi.fn(() => null);

        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getComment('c-missing')).toBeNull();
      });

      it('returns null when commentsStore.getComment is missing', async () => {
        const { commentsStore } = createAppHarness();
        // Simulate a store mock that hasn't defined getComment.
        commentsStore.getComment = undefined;

        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getComment('c-1')).toBeNull();
      });

      it('returns null for empty or non-string commentId', async () => {
        createAppHarness();
        const instance = new SuperDoc({
          selector: '#host',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {}, toolbar: {} },
          onException: vi.fn(),
        });
        await flushMicrotasks();

        expect(instance.getComment('')).toBeNull();
        expect(instance.getComment(undefined)).toBeNull();
        expect(instance.getComment(null)).toBeNull();
        expect(instance.getComment(123)).toBeNull();
      });
    });
  });

  it('warns when both document object and documents list provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createAppHarness();

    const blob = new Blob(['test'], { type: DOCX });
    const config = {
      selector: '#host',
      document: { data: blob, name: 'doc1.docx' },
      documents: [{ type: DOCX, url: 'https://example.com/file.docx' }],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    };

    const instance = new SuperDoc(config);
    await flushMicrotasks();

    expect(warnSpy).toHaveBeenCalledWith('🦋 [superdoc] You can only provide one of document or documents');
    expect(instance.config.documents).toHaveLength(1);
    expect(instance.config.documents[0].name).toBe('doc1.docx');
    warnSpy.mockRestore();
  });

  it('initializes collaboration for hocuspocus provider', async () => {
    const { superdocStore } = createAppHarness();
    superdocStore.documents = [
      {
        id: 'doc-1',
        type: DOCX,
        getEditor: vi.fn(() => ({ commands: { togglePagination: vi.fn() } })),
      },
    ];

    const config = {
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: { useInternalExternalComments: false },
        toolbar: {},
        collaboration: {
          providerType: 'hocuspocus',
          url: 'wss://example.com',
          suppressInternalExternalComments: false,
        },
      },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    };

    const instance = new SuperDoc(config);
    await flushMicrotasks();

    expect(MockHocuspocusProviderWebsocket.instances).toHaveLength(1);
    expect(MockHocuspocusProviderWebsocket.instances[0].config).toEqual({ url: 'wss://example.com' });
    expect(makeDocumentsCollaborativeMock).toHaveBeenCalledWith(instance);
    expect(initCollaborationCommentsMock).toHaveBeenCalledWith(instance);
    expect(instance.isCollaborative).toBe(true);
    expect(instance.provider).toBeDefined();
    expect(instance.ydoc).toBeDefined();
  });

  it('uses a separate SuperDoc ydoc when internal/external comments sync is enabled', async () => {
    createAppHarness();
    const superdocYdoc = { destroy: vi.fn() };
    const superdocProvider = { disconnect: vi.fn(), destroy: vi.fn(), on: vi.fn(), off: vi.fn() };
    initSuperdocYdocMock.mockImplementationOnce(() => ({
      ydoc: superdocYdoc,
      provider: superdocProvider,
    }));

    const instance = new SuperDoc({
      selector: '#host',
      superdocId: 'superdoc-room',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: { useInternalExternalComments: true, suppressInternalExternalComments: false },
        toolbar: {},
        collaboration: {
          providerType: 'hocuspocus',
          url: 'wss://example.com',
        },
      },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(MockHocuspocusProviderWebsocket.instances).toHaveLength(1);
    expect(instance.config.socket).toBe(MockHocuspocusProviderWebsocket.instances[0]);
    expect(initSuperdocYdocMock).toHaveBeenCalledWith(instance);
    expect(instance.ydoc).toBe(superdocYdoc);
    expect(instance.provider).toBe(superdocProvider);
  });

  // pagination legacy removed; togglePagination test removed

  it('broadcasts ready only when all editors resolved', async () => {
    const { superdocStore } = createAppHarness();
    superdocStore.documents = [
      { type: DOCX, getEditor: vi.fn(() => ({})), setEditor: vi.fn() },
      { type: DOCX, getEditor: vi.fn(() => ({})), setEditor: vi.fn() },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const readySpy = vi.fn();
    instance.on('ready', readySpy);

    const editor = {};
    instance.broadcastEditorCreate(editor);
    expect(readySpy).not.toHaveBeenCalled();

    instance.broadcastEditorCreate(editor);
    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  describe('fonts-changed relay', () => {
    const makeEmitterEditor = (overrides = {}) => {
      const listeners = {};
      return {
        options: { documentId: 'doc-1' },
        on: vi.fn((event, cb) => {
          (listeners[event] ||= []).push(cb);
        }),
        emit: (event, payload) => (listeners[event] || []).forEach((cb) => cb(payload)),
        ...overrides,
      };
    };
    const makeInstance = async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        colors: ['red'],
        user: { name: 'Jane', email: 'jane@example.com' },
        onException: vi.fn(),
      });
      await flushMicrotasks();
      return instance;
    };

    it('relays an editor fonts-changed event up to the SuperDoc surface', async () => {
      const instance = await makeInstance();
      const editor = makeEmitterEditor();
      const received = [];
      instance.on('fonts-changed', (p) => received.push(p));
      instance.broadcastEditorCreate(editor);
      const payload = {
        documentFonts: ['Calibri'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'late-load',
        version: 1,
      };
      editor.emit('fonts-changed', payload);
      expect(received).toContainEqual(payload);
    });

    it('replays the presentation editor cached report when the relay subscribes after emission', async () => {
      const instance = await makeInstance();
      const cached = {
        documentFonts: ['Aptos'],
        resolutions: [],
        missingFonts: ['Aptos'],
        loadSummary: { loaded: 0, failed: 0, timedOut: 0, fallbackUsed: 1, results: [] },
        source: 'initial',
        version: 0,
      };
      const editor = makeEmitterEditor({ presentationEditor: { getLastFontsChangedPayload: () => cached } });
      const received = [];
      instance.on('fonts-changed', (p) => received.push(p));
      instance.broadcastEditorCreate(editor);
      expect(received).toContainEqual(cached);
    });

    it('does not throw for an editor without .on, and wires the relay at most once', async () => {
      const instance = await makeInstance();
      expect(() => instance.broadcastEditorCreate({})).not.toThrow();

      const editor = makeEmitterEditor();
      instance.broadcastEditorCreate(editor);
      instance.broadcastEditorCreate(editor);
      const fontsChangedSubscriptions = editor.on.mock.calls.filter((call) => call[0] === 'fonts-changed').length;
      expect(fontsChangedSubscriptions).toBe(1);
    });

    it('fonts.onReport delivers the current report immediately, then streams changes until unsubscribed', async () => {
      const instance = await makeInstance();
      const initial = {
        documentFonts: ['Calibri'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'initial',
        version: 0,
      };
      const editor = makeEmitterEditor({ presentationEditor: { getLastFontsChangedPayload: () => initial } });
      instance.broadcastEditorCreate(editor); // delivers `initial`, caching it on the instance

      const received = [];
      const unsubscribe = instance.fonts.onReport((p) => received.push(p));
      expect(received).toEqual([initial]); // immediate snapshot, even though we subscribed late

      const next = { ...initial, source: 'late-load', version: 1, missingFonts: ['Aptos'] };
      editor.emit('fonts-changed', next);
      expect(received).toEqual([initial, next]); // streamed

      unsubscribe();
      editor.emit('fonts-changed', { ...initial, version: 2 });
      expect(received).toHaveLength(2); // silent after unsubscribe
    });

    it('fonts.onReport never replays a prior editor report after an active-editor switch', async () => {
      const instance = await makeInstance();
      const reportA = {
        documentFonts: ['Calibri'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'initial',
        version: 0,
      };
      const editorA = makeEmitterEditor({ presentationEditor: { getLastFontsChangedPayload: () => reportA } });
      instance.activeEditor = editorA;
      instance.broadcastEditorCreate(editorA); // delivers reportA + populates the instance cache

      // Switch the active editor to B, which has not produced a report yet.
      const editorB = makeEmitterEditor({ presentationEditor: { getLastFontsChangedPayload: () => null } });
      instance.activeEditor = editorB;

      const received = [];
      instance.fonts.onReport((p) => received.push(p));
      expect(received).toEqual([]); // B has no report yet -> deliver nothing, never the stale A

      const reportB = {
        documentFonts: ['Cambria'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'initial',
        version: 0,
      };
      instance.broadcastEditorCreate(editorB);
      editorB.emit('fonts-changed', reportB);
      expect(received).toEqual([reportB]); // only B, via the subscription
    });

    it('fonts.getReport / getMissingFonts / getDocumentFonts read the active editor report', async () => {
      const instance = await makeInstance();
      const report = [
        { logicalFamily: 'Calibri', physicalFamily: 'Carlito', status: 'loaded' },
        { logicalFamily: 'Aptos', physicalFamily: 'Aptos', status: 'fallback' },
      ];
      const editor = makeEmitterEditor({
        presentationEditor: {
          getFontReport: () => report,
          getMissingFonts: () => ['Aptos'],
          getLastFontsChangedPayload: () => null,
        },
      });
      instance.activeEditor = editor;

      expect(instance.fonts.getReport()).toBe(report);
      expect(instance.fonts.getMissingFonts()).toEqual(['Aptos']);
      // getDocumentFonts maps the report to logical family names.
      expect(instance.fonts.getDocumentFonts()).toEqual(['Calibri', 'Aptos']);
    });

    it('fonts.* return empty arrays when no editor is active', async () => {
      const instance = await makeInstance();
      instance.activeEditor = null;

      expect(instance.fonts.getReport()).toEqual([]);
      expect(instance.fonts.getMissingFonts()).toEqual([]);
      expect(instance.fonts.getDocumentFonts()).toEqual([]);
    });

    it('does not relay fonts-changed from an editor that is no longer active', async () => {
      const instance = await makeInstance();
      const oldEditor = makeEmitterEditor();
      const newEditor = makeEmitterEditor();
      instance.broadcastEditorCreate(oldEditor);
      instance.broadcastEditorCreate(newEditor);
      instance.activeEditor = newEditor; // document swap: newEditor is the active document

      const received = [];
      instance.on('fonts-changed', (p) => received.push(p));

      // The old (inactive) editor finishes a timed-out font and emits late.
      oldEditor.emit('fonts-changed', {
        documentFonts: ['Calibri'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'late-load',
        version: 9,
      });
      expect(received).toEqual([]); // dropped: not the active editor

      // The active editor's report still surfaces.
      const activePayload = {
        documentFonts: ['Cambria'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'late-load',
        version: 1,
      };
      newEditor.emit('fonts-changed', activePayload);
      expect(received).toEqual([activePayload]);
    });

    it('does not replay a cached report when an inactive editor is created', async () => {
      const instance = await makeInstance();
      const activeEditor = makeEmitterEditor();
      instance.activeEditor = activeEditor;
      instance.broadcastEditorCreate(activeEditor); // active editor, no cached payload

      const received = [];
      instance.on('fonts-changed', (p) => received.push(p));

      // A different, non-active editor is created and already has a cached report. Its
      // replay-on-wire must obey the same active-editor rule as the live event.
      const stale = {
        documentFonts: ['Calibri'],
        resolutions: [],
        missingFonts: [],
        loadSummary: { loaded: 1, failed: 0, timedOut: 0, fallbackUsed: 0, results: [] },
        source: 'initial',
        version: 0,
      };
      const inactiveEditor = makeEmitterEditor({
        presentationEditor: { getLastFontsChangedPayload: () => stale },
      });
      instance.broadcastEditorCreate(inactiveEditor);

      expect(received).toEqual([]); // cached replay from the inactive editor dropped
    });
  });

  it('uses visible search model in SuperDoc.search()', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const searchResult = [{ from: 1, to: 4 }];
    const searchMock = vi.fn(() => searchResult);
    instance.activeEditor = { commands: { search: searchMock } };

    const result = instance.search('test');

    expect(searchMock).toHaveBeenCalledWith('test', { searchModel: 'visible' });
    expect(result).toBe(searchResult);
  });

  it('locks superdoc via ydoc metadata and emits event', async () => {
    createAppHarness();

    const metaSet = vi.fn();
    const metaMap = { set: metaSet };

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    instance.config.documents = [
      {
        ydoc: {
          getMap: vi.fn(() => metaMap),
          transact: (fn) => fn(),
        },
      },
    ];

    const lockedSpy = vi.fn();
    instance.on('locked', lockedSpy);

    instance.setLocked(true);
    expect(metaSet).toHaveBeenNthCalledWith(1, 'locked', true);
    expect(metaSet).toHaveBeenNthCalledWith(2, 'lockedBy', instance.user);
    expect(lockedSpy).not.toHaveBeenCalled();
    instance.lockSuperdoc(true, { name: 'Admin' });
    expect(lockedSpy).toHaveBeenCalledWith({ isLocked: true, lockedBy: { name: 'Admin' } });
  });

  it('exports docx files alongside additional assets', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
      title: 'Test Export',
    });
    await flushMicrotasks();

    vi.spyOn(instance, 'exportEditorsToDOCX').mockResolvedValue(['docx-blob']);

    const extraBlob = new Blob(['extra']);
    await instance.export({
      exportType: ['docx', 'txt'],
      additionalFiles: [extraBlob],
      additionalFileNames: ['extra.txt'],
      commentsType: 'all',
      triggerDownload: true,
    });

    expect(createZipMock).toHaveBeenCalled();
    expect(createDownloadMock).toHaveBeenCalledWith(expect.any(Object), 'Test-Export', 'zip');
  });

  it('falls back to original document data when an editor export yields no blob', async () => {
    const { superdocStore } = createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const originalBlob = { name: 'fallback.docx' };
    const exportDocxMock = vi.fn().mockResolvedValue(undefined);

    instance.superdocStore.documents = [
      {
        id: 'doc-1',
        type: DOCX,
        data: originalBlob,
        getEditor: () => ({ exportDocx: exportDocxMock }),
      },
    ];

    const results = await instance.exportEditorsToDOCX();

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([originalBlob]);
  });

  it('falls back to original document data and keeps sibling exports when an editor export rejects', async () => {
    createAppHarness();
    const onException = vi.fn();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException,
    });
    await flushMicrotasks();

    const exportError = new Error('export failed');
    const originalBlob = new Blob(['fallback'], { type: DOCX });
    const siblingBlob = new Blob(['exported'], { type: DOCX });
    const failedExportDocxMock = vi.fn().mockRejectedValue(exportError);
    const siblingExportDocxMock = vi.fn().mockResolvedValue(siblingBlob);
    const failedDoc = {
      id: 'doc-1',
      type: DOCX,
      data: originalBlob,
      getEditor: () => ({ exportDocx: failedExportDocxMock }),
    };
    const siblingDoc = {
      id: 'doc-2',
      type: DOCX,
      data: null,
      getEditor: () => ({ exportDocx: siblingExportDocxMock }),
    };

    instance.superdocStore.documents = [failedDoc, siblingDoc];

    const results = await instance.exportEditorsToDOCX();

    expect(failedExportDocxMock).toHaveBeenCalledTimes(1);
    expect(siblingExportDocxMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([originalBlob, siblingBlob]);
    expect(onException).toHaveBeenCalledTimes(1);
    expect(onException).toHaveBeenCalledWith({ error: exportError, document: failedDoc });
  });

  it('does not emit a duplicate wrapper exception when the editor already bridged the export error', async () => {
    createAppHarness();
    const onException = vi.fn();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException,
    });
    await flushMicrotasks();

    const exportError = new Error('export failed');
    const originalBlob = new Blob(['fallback'], { type: DOCX });
    const editor = {
      exportDocx: vi.fn(async () => {
        instance.emit('exception', { error: exportError, editor });
        throw exportError;
      }),
    };

    instance.superdocStore.documents = [
      {
        id: 'doc-1',
        type: DOCX,
        data: originalBlob,
        getEditor: () => editor,
      },
    ];

    const results = await instance.exportEditorsToDOCX();

    expect(editor.exportDocx).toHaveBeenCalledTimes(1);
    expect(results).toEqual([originalBlob]);
    expect(onException).toHaveBeenCalledTimes(1);
    expect(onException).toHaveBeenCalledWith({ error: exportError, editor });
  });

  it('drops non-DOCX fallback data when an editor export yields no blob', async () => {
    const { superdocStore } = createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const exportDocxMock = vi.fn().mockResolvedValue(undefined);

    instance.superdocStore.documents = [
      {
        id: 'doc-1',
        type: DOCX,
        data: new Blob(['pdf'], { type: PDF }),
        getEditor: () => ({ exportDocx: exportDocxMock }),
      },
    ];

    const results = await instance.exportEditorsToDOCX();

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });

  it('passes comments: undefined when the UI store is unhydrated (modules.comments: false)', async () => {
    // Regression for the Custom UI story. With the built-in comments
    // module disabled, the UI store never holds the imported
    // comments, so the export must hand off `undefined` and let
    // `Editor.exportDocx`'s `comments ?? this.converter.comments`
    // fallback fire. Passing `[]` here would silently drop every
    // imported comment from the round-trip.
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: false, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const exportDocxMock = vi.fn().mockResolvedValue(new Blob(['out']));
    instance.superdocStore.documents = [
      { id: 'doc-1', type: DOCX, data: null, getEditor: () => ({ exportDocx: exportDocxMock }) },
    ];

    await instance.exportEditorsToDOCX();

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    const passed = exportDocxMock.mock.calls[0][0];
    expect(passed.comments).toBeUndefined();
  });

  it('passes comments: [] when the UI store IS hydrated and the user deleted every comment', async () => {
    // Regression for the deletion-resurrection bug a reviewer
    // spotted on the first patch. When `modules.comments` is
    // enabled (default), the UI store IS the source of truth: an
    // authoritative-empty array means "user deleted everything,"
    // not "store is unhydrated." Passing `undefined` here would
    // route through `Editor.exportDocx`'s `converter.comments`
    // fallback and resurrect every imported comment that the user
    // had explicitly deleted via the built-in UI.
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    instance.commentsStore.translateCommentsForExport = vi.fn(() => []);
    const exportDocxMock = vi.fn().mockResolvedValue(new Blob(['out']));
    instance.superdocStore.documents = [
      { id: 'doc-1', type: DOCX, data: null, getEditor: () => ({ exportDocx: exportDocxMock }) },
    ];

    await instance.exportEditorsToDOCX();

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    const passed = exportDocxMock.mock.calls[0][0];
    expect(passed.comments).toEqual([]);
  });

  it('passes comments: [] when commentsType is "clean" so the engine emits no comments', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    // Even when the UI store would yield comments, `'clean'` is the
    // explicit "strip all comments" signal and must override.
    instance.commentsStore.translateCommentsForExport = vi.fn(() => [
      { commentId: 'c1', creatorEmail: 'x@y.z', elements: [] },
    ]);
    const exportDocxMock = vi.fn().mockResolvedValue(new Blob(['out']));
    instance.superdocStore.documents = [
      { id: 'doc-1', type: DOCX, data: null, getEditor: () => ({ exportDocx: exportDocxMock }) },
    ];

    await instance.exportEditorsToDOCX({ commentsType: 'clean' });

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    const passed = exportDocxMock.mock.calls[0][0];
    expect(passed.comments).toEqual([]);
  });

  it("commentsType: 'clean' wins even when modules.comments is disabled", async () => {
    // 'clean' is the explicit "strip all comments" signal. When the
    // UI store is unhydrated AND the consumer asks for clean, the
    // engine fallback to `converter.comments` must NOT fire; that
    // would silently re-include imported comments the consumer
    // explicitly asked to drop. This branch is the one place where
    // module-disabled + clean must pass `[]` instead of `undefined`.
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: false, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const exportDocxMock = vi.fn().mockResolvedValue(new Blob(['out']));
    instance.superdocStore.documents = [
      { id: 'doc-1', type: DOCX, data: null, getEditor: () => ({ exportDocx: exportDocxMock }) },
    ];

    await instance.exportEditorsToDOCX({ commentsType: 'clean' });

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    expect(exportDocxMock.mock.calls[0][0].comments).toEqual([]);
  });

  it('falls back to undefined when commentsStore is missing entirely (no race throw)', async () => {
    // Defensive: during certain init phases or in test stubs, the
    // commentsStore may be absent. The export must not throw and must
    // route to the engine fallback (undefined). The original code
    // already guarded with `this.commentsStore && typeof ...`; this
    // test pins that the guard survives the rewrite.
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    // Simulate a missing commentsStore (the Pinia store was never
    // attached, e.g., a partial init path).
    instance.commentsStore = null;
    const exportDocxMock = vi.fn().mockResolvedValue(new Blob(['out']));
    instance.superdocStore.documents = [
      { id: 'doc-1', type: DOCX, data: null, getEditor: () => ({ exportDocx: exportDocxMock }) },
    ];

    await expect(instance.exportEditorsToDOCX()).resolves.toBeDefined();
    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    expect(exportDocxMock.mock.calls[0][0].comments).toBeUndefined();
  });

  it('passes UI-store comments when the store has them', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const fromStore = [{ commentId: 'c1', creatorEmail: 'a@b.c', elements: [] }];
    instance.commentsStore.translateCommentsForExport = vi.fn(() => fromStore);
    const exportDocxMock = vi.fn().mockResolvedValue(new Blob(['out']));
    instance.superdocStore.documents = [
      { id: 'doc-1', type: DOCX, data: null, getEditor: () => ({ exportDocx: exportDocxMock }) },
    ];

    await instance.exportEditorsToDOCX();

    expect(exportDocxMock).toHaveBeenCalledTimes(1);
    const passed = exportDocxMock.mock.calls[0][0];
    expect(passed.comments).toEqual(fromStore);
  });

  it('skips non-DOCX documents when exporting editors to DOCX', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.pdf',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const docxBlob = { name: 'doc-1.docx', type: DOCX };
    const pdfBlob = { name: 'doc-2.pdf', type: PDF };

    instance.superdocStore.documents = [
      {
        id: 'doc-1',
        type: DOCX,
        data: docxBlob,
        getEditor: () => null,
      },
      {
        id: 'doc-2',
        type: PDF,
        data: pdfBlob,
        getEditor: () => null,
      },
    ];

    const results = await instance.exportEditorsToDOCX();

    expect(results).toEqual([docxBlob]);
  });

  it('destroys app and cleans providers', async () => {
    const { app } = createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: {},
        toolbar: {},
        collaboration: { providerType: 'hocuspocus', url: 'wss://example.com' },
      },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const provider = instance.provider;
    const processedDocs = instance.config.documents;

    instance.destroy();

    expect(provider.disconnect).toHaveBeenCalled();
    expect(provider.destroy).toHaveBeenCalled();
    processedDocs.forEach((doc) => {
      expect(doc.provider.disconnect).toHaveBeenCalled();
      expect(doc.provider.destroy).toHaveBeenCalled();
      expect(doc.ydoc.destroy).toHaveBeenCalled();
    });
    expect(app.unmount).toHaveBeenCalled();
    expect(instance.app.config.globalProperties.$config).toBeUndefined();
    expect(instance.listenerCount('ready')).toBe(0);
  });

  it('destroy() does not throw when providers omit optional disconnect/destroy methods', async () => {
    createAppHarness();

    // SD-2828: `CollaborationProvider` has optional `disconnect` and `destroy`.
    // Liveblocks-style adapters legally satisfy the type with just on/off, so
    // cleanup must guard the method, not just the provider.
    const minimalSuperdocProvider = { on: vi.fn(), off: vi.fn() };
    const minimalDocProvider = { on: vi.fn(), off: vi.fn() };

    initSuperdocYdocMock.mockImplementationOnce(() => ({
      ydoc: { destroy: vi.fn() },
      provider: minimalSuperdocProvider,
    }));
    makeDocumentsCollaborativeMock.mockImplementationOnce((superdoc) =>
      superdoc.config.documents.map((doc, index) => {
        Object.assign(doc, {
          id: doc.id || `doc-${index}`,
          provider: minimalDocProvider,
          ydoc: { destroyed: false, destroy: vi.fn() },
          socket: superdoc.config.socket,
        });
        return doc;
      }),
    );

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: {},
        toolbar: {},
        collaboration: { providerType: 'hocuspocus', url: 'wss://example.com' },
      },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    expect(() => instance.destroy()).not.toThrow();
  });

  it('mounts Vue on a wrapper element inside the user container', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
    });
    await flushMicrotasks();

    const host = document.querySelector('#host');
    const mountArg = app.mount.mock.calls[0][0];

    // Vue should mount on a child wrapper, not the user's container
    expect(mountArg).toBeInstanceOf(HTMLDivElement);
    expect(mountArg.parentElement).toBe(host);
  });

  it('removes wrapper element on destroy', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
    });
    await flushMicrotasks();

    const host = document.querySelector('#host');
    expect(host.children.length).toBe(1);

    instance.destroy();

    expect(host.children.length).toBe(0);
    expect(app.unmount).toHaveBeenCalled();
  });

  it('allows re-mounting after destroy (React StrictMode pattern)', async () => {
    const { app } = createAppHarness();

    // First mount
    const instance1 = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
    });
    await flushMicrotasks();

    const host = document.querySelector('#host');
    expect(host.children.length).toBe(1);

    // Destroy (simulates React cleanup)
    instance1.destroy();
    expect(host.children.length).toBe(0);

    // Re-mount (simulates React re-render)
    const { app: app2 } = createAppHarness();
    const instance2 = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
    });
    await flushMicrotasks();

    // Second mount should work without errors
    expect(app2.mount).toHaveBeenCalled();
    const mountArg = app2.mount.mock.calls[0][0];
    expect(mountArg.parentElement).toBe(host);
    expect(host.children.length).toBe(1);
  });

  it('mounts Vue on wrapper when selector is a DOM element', async () => {
    const { app } = createAppHarness();
    const host = document.querySelector('#host');

    const instance = new SuperDoc({
      selector: host,
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
    });
    await flushMicrotasks();

    const mountArg = app.mount.mock.calls[0][0];
    expect(mountArg).toBeInstanceOf(HTMLDivElement);
    expect(mountArg.parentElement).toBe(host);
  });

  it('throws when selector does not match any DOM element', () => {
    createAppHarness();
    expect(
      () =>
        new SuperDoc({
          selector: '#nonexistent',
          document: 'https://example.com/doc.docx',
          documents: [],
          modules: { comments: {} },
          colors: ['red'],
          user: { name: 'Jane', email: 'jane@example.com' },
        }),
    ).toThrow('SuperDoc: selector must be a valid CSS selector string or DOM element');
  });

  it('prevents app mounting if destroy is called during async init', async () => {
    const { app } = createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });

    // Call destroy BEFORE async init completes
    instance.destroy();

    // Wait for any pending init to complete
    await flushMicrotasks();

    // App should not have been mounted because destroy() set #destroyed = true
    expect(app.mount).not.toHaveBeenCalled();
  });

  it('cleans up collaboration resources if destroy is called during async init', async () => {
    const { app } = createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: {
        comments: {},
        toolbar: {},
        collaboration: { providerType: 'hocuspocus', url: 'wss://example.com' },
      },
      colors: [],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });

    // Call destroy BEFORE async init completes
    instance.destroy();

    // Wait for any pending init to complete
    await flushMicrotasks();

    // App should not have been mounted
    expect(app.mount).not.toHaveBeenCalled();

    // Collaboration resources should still be cleaned up
    expect(instance.provider.disconnect).toHaveBeenCalled();
    expect(instance.provider.destroy).toHaveBeenCalled();
    instance.config.documents.forEach((doc) => {
      expect(doc.provider.disconnect).toHaveBeenCalled();
      expect(doc.provider.destroy).toHaveBeenCalled();
      expect(doc.ydoc.destroy).toHaveBeenCalled();
    });
  });

  it('removes comments in viewing mode and restores them when returning to editing', async () => {
    const { superdocStore } = createAppHarness();
    const removeComments = vi.fn();
    const restoreComments = vi.fn();
    const setDocumentMode = vi.fn();
    const docStub = {
      removeComments,
      restoreComments,
      getEditor: vi.fn(() => ({ setDocumentMode })),
      getPresentationEditor: vi.fn(() => null),
    };
    superdocStore.documents = [docStub];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    instance.setDocumentMode('viewing');
    expect(removeComments).toHaveBeenCalledTimes(1);
    expect(setDocumentMode).toHaveBeenLastCalledWith('viewing');

    instance.setDocumentMode('editing');
    expect(restoreComments).toHaveBeenCalledTimes(1);
    expect(setDocumentMode).toHaveBeenLastCalledWith('editing');
  });

  it('falls back to viewing mode when suggesting is requested without a role', async () => {
    const { superdocStore } = createAppHarness();
    const removeComments = vi.fn();
    const setDocumentMode = vi.fn();
    const docStub = {
      removeComments,
      restoreComments: vi.fn(),
      getEditor: vi.fn(() => ({ setDocumentMode })),
      getPresentationEditor: vi.fn(() => null),
    };
    superdocStore.documents = [docStub];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: undefined,
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    instance.setDocumentMode('suggesting');

    expect(removeComments).toHaveBeenCalledTimes(1);
    expect(setDocumentMode).toHaveBeenLastCalledWith('viewing');
  });

  it('applies suggesting mode when the role permits suggestions', async () => {
    const { superdocStore } = createAppHarness();
    const restoreComments = vi.fn();
    const setDocumentMode = vi.fn();
    const docStub = {
      removeComments: vi.fn(),
      restoreComments,
      getEditor: vi.fn(() => ({ setDocumentMode })),
      getPresentationEditor: vi.fn(() => null),
    };
    superdocStore.documents = [docStub];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    instance.setDocumentMode('suggesting');

    expect(restoreComments).toHaveBeenCalledTimes(1);
    expect(setDocumentMode).toHaveBeenLastCalledWith('suggesting');
  });

  it('routes document mode changes through registered runtimes and their presentation editors before legacy fallback', async () => {
    const { superdocStore } = createAppHarness();
    const legacyDocMode = vi.fn();
    const runtimeBackedEditorMode = vi.fn();
    const runtimeBackedPresentationMode = vi.fn();
    superdocStore.documents = [
      {
        id: 'doc-1',
        removeComments: vi.fn(),
        restoreComments: vi.fn(),
        getEditor: vi.fn(() => ({ setDocumentMode: runtimeBackedEditorMode })),
        getPresentationEditor: vi.fn(() => ({ setDocumentMode: runtimeBackedPresentationMode })),
      },
      {
        id: 'doc-2',
        removeComments: vi.fn(),
        restoreComments: vi.fn(),
        getEditor: vi.fn(() => ({ setDocumentMode: legacyDocMode })),
        getPresentationEditor: vi.fn(() => null),
      },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const runtimeA = createFakeV1Runtime({ id: 'v1-a', documentId: 'doc-1' });
    const runtimeB = createFakeV1Runtime({ id: 'v1-b', documentId: 'doc-1' });
    const setModeA = vi.spyOn(runtimeA, 'setDocumentMode');
    const setModeB = vi.spyOn(runtimeB, 'setDocumentMode');
    instance.registerEditorRuntime(runtimeA);
    instance.registerEditorRuntime(runtimeB);

    instance.setDocumentMode('suggesting');

    expect(setModeA).toHaveBeenCalledWith('suggesting');
    expect(setModeB).toHaveBeenCalledWith('suggesting');
    expect(runtimeBackedEditorMode).not.toHaveBeenCalled();
    expect(runtimeBackedPresentationMode).toHaveBeenCalledWith('suggesting');
    expect(legacyDocMode).toHaveBeenCalledWith('suggesting');
  });

  it('syncs a stale presentation host class after runtime document-mode propagation', async () => {
    const { superdocStore } = createAppHarness();
    const presentationElement = document.createElement('div');
    presentationElement.className = 'presentation-editor';
    const presentationEditor = {
      element: presentationElement,
      setDocumentMode: vi.fn((mode) => {
        presentationElement.classList.toggle('presentation-editor--viewing', mode === 'viewing');
      }),
    };
    superdocStore.documents = [
      {
        id: 'doc-1',
        removeComments: vi.fn(),
        restoreComments: vi.fn(),
        getEditor: vi.fn(() => null),
        getPresentationEditor: vi.fn(() => presentationEditor),
      },
    ];

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const runtime = createFakeV1Runtime({ id: 'v1-a', documentId: 'doc-1' });
    const setMode = vi.spyOn(runtime, 'setDocumentMode');
    instance.registerEditorRuntime(runtime);

    instance.setDocumentMode('viewing');

    expect(setMode).toHaveBeenCalledWith('viewing');
    expect(presentationEditor.setDocumentMode).toHaveBeenCalledWith('viewing');
    expect(presentationElement.classList.contains('presentation-editor--viewing')).toBe(true);
  });

  it('updates viewing comment options for presentation editors', async () => {
    const { superdocStore } = createAppHarness();
    const setViewingCommentOptions = vi.fn();
    const setDocumentMode = vi.fn();
    const presentationEditor = {
      setViewingCommentOptions,
      setDocumentMode,
    };
    const docStub = {
      removeComments: vi.fn(),
      restoreComments: vi.fn(),
      getEditor: vi.fn(() => null),
      getPresentationEditor: vi.fn(() => presentationEditor),
    };

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {}, trackChanges: { visible: true } },
      comments: { visible: true },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    superdocStore.documents = [docStub];

    instance.setDocumentMode('viewing');

    expect(setViewingCommentOptions).toHaveBeenCalledWith({
      emitCommentPositionsInViewing: true,
      enableCommentsInViewing: true,
    });
  });

  it('propagates context menu toggles to presentation and flow editors and skips no-op updates', async () => {
    const { superdocStore } = createAppHarness();
    const setContextMenuDisabled = vi.fn();
    const setOptions = vi.fn();
    const docStub = {
      getPresentationEditor: vi.fn(() => ({ setContextMenuDisabled })),
      getEditor: vi.fn(() => ({ setOptions })),
    };

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    superdocStore.documents = [docStub];

    instance.setDisableContextMenu(false);
    expect(setContextMenuDisabled).not.toHaveBeenCalled();
    expect(setOptions).not.toHaveBeenCalled();

    instance.setDisableContextMenu(true);
    expect(instance.config.disableContextMenu).toBe(true);
    expect(setContextMenuDisabled).toHaveBeenCalledWith(true);
    expect(setOptions).toHaveBeenCalledWith({ disableContextMenu: true });

    instance.setDisableContextMenu(true);
    expect(setContextMenuDisabled).toHaveBeenCalledTimes(1);
    expect(setOptions).toHaveBeenCalledTimes(1);

    instance.setDisableContextMenu(false);
    expect(instance.config.disableContextMenu).toBe(false);
    expect(setContextMenuDisabled).toHaveBeenLastCalledWith(false);
    expect(setOptions).toHaveBeenLastCalledWith({ disableContextMenu: false });
  });

  it('propagates setShowBookmarks to presentation editors and skips no-op toggles', async () => {
    const { superdocStore } = createAppHarness();
    const setShowBookmarks = vi.fn();
    const docStub = {
      getPresentationEditor: vi.fn(() => ({ setShowBookmarks })),
    };

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    superdocStore.documents = [docStub];

    // Enabling flips the flag and reaches the presentation editor.
    instance.setShowBookmarks(true);
    expect(instance.config.layoutEngineOptions.showBookmarks).toBe(true);
    expect(setShowBookmarks).toHaveBeenCalledWith(true);

    // Same value again is a no-op.
    instance.setShowBookmarks(true);
    expect(setShowBookmarks).toHaveBeenCalledTimes(1);

    // Disabling flips it back.
    instance.setShowBookmarks(false);
    expect(instance.config.layoutEngineOptions.showBookmarks).toBe(false);
    expect(setShowBookmarks).toHaveBeenLastCalledWith(false);

    // Default argument coerces to true.
    instance.setShowBookmarks();
    expect(setShowBookmarks).toHaveBeenLastCalledWith(true);

    // Non-boolean values go through Boolean().
    instance.setShowBookmarks(null);
    expect(setShowBookmarks).toHaveBeenLastCalledWith(false);
  });

  it('propagates setShowFormattingMarks to presentation editors and skips no-op toggles', async () => {
    const { superdocStore } = createAppHarness();
    const setShowFormattingMarks = vi.fn();
    const docStub = {
      getPresentationEditor: vi.fn(() => ({ setShowFormattingMarks })),
    };

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    superdocStore.documents = [docStub];

    instance.setShowFormattingMarks(true);
    expect(instance.config.layoutEngineOptions.showFormattingMarks).toBe(true);
    expect(setShowFormattingMarks).toHaveBeenCalledWith(true);

    instance.setShowFormattingMarks(true);
    expect(setShowFormattingMarks).toHaveBeenCalledTimes(1);

    instance.setShowFormattingMarks(false);
    expect(instance.config.layoutEngineOptions.showFormattingMarks).toBe(false);
    expect(setShowFormattingMarks).toHaveBeenLastCalledWith(false);

    instance.toggleFormattingMarks();
    expect(setShowFormattingMarks).toHaveBeenLastCalledWith(true);
  });

  it('propagates toggleRuler to all store documents after ready', async () => {
    const { superdocStore } = createAppHarness();
    const firstDoc = { rulers: false };
    const secondDoc = { rulers: false };

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      rulers: false,
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    superdocStore.documents = [firstDoc, secondDoc];
    instance.toggleRuler();

    expect(instance.config.rulers).toBe(true);
    expect(firstDoc.rulers).toBe(true);
    expect(secondDoc.rulers).toBe(true);
  });

  it('renders comments list for non-viewer roles and emits the rendered callback', async () => {
    createAppHarness();
    const onCommentsListChange = vi.fn();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'editor',
      user: { name: 'Jane', email: 'jane@example.com' },
      onCommentsListChange,
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const container = document.createElement('div');
    instance.addCommentsList(container);

    expect(instance.config.modules.comments.element).toBe(container);
    expect(superCommentsConstructor).toHaveBeenCalledWith(instance.config.modules.comments, instance);
    expect(instance.commentsList).toBeDefined();
    expect(onCommentsListChange).toHaveBeenCalledWith({ isRendered: true });
  });

  it('skips rendering comments list when role is viewer', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      role: 'viewer',
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });
    await flushMicrotasks();

    const container = document.createElement('div');
    instance.addCommentsList(container);

    expect(superCommentsConstructor).not.toHaveBeenCalled();
    expect(instance.config.modules.comments.element).toBeUndefined();
    expect(instance.commentsList).toBeUndefined();
  });

  it('applies CSP nonce to style tags when configured', async () => {
    createAppHarness();

    const instance = new SuperDoc({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
      cspNonce: 'nonce-123',
    });
    await flushMicrotasks();

    const styleElement = document.createElement('style');
    expect(styleElement.getAttribute('nonce')).toBe('nonce-123');
  });

  describe('SuperDoc document normalization', () => {
    describe('real-world document handling', () => {
      it('handles File from browser input', async () => {
        createAppHarness();

        // Real browser File object
        const file = new File(['content'], 'contract.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        const instance = new SuperDoc({
          selector: '#host',
          document: file,
        });
        await flushMicrotasks();

        expect(instance.config.documents).toHaveLength(1);
        expect(instance.config.documents[0]).toMatchObject({
          id: expect.any(String),
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          name: 'contract.docx',
        });
        // isNewFile should NOT be set when importing existing files
        // It should only be true when creating from blank template
        expect(instance.config.documents[0].isNewFile).toBeUndefined();
        expect(instance.config.documents[0].data).toBe(file);
      });

      it('handles File inputs through the native File branch when the File is not an uploader wrapper', async () => {
        createAppHarness();

        const file = new File(['content'], 'contract.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const branchOnlyFile = new Proxy(file, {
          ownKeys: () => [],
        });

        const instance = new SuperDoc({
          selector: '#host',
          document: branchOnlyFile,
        });
        await flushMicrotasks();

        expect(instance.config.documents).toHaveLength(1);
        expect(instance.config.documents[0]).toMatchObject({
          id: expect.any(String),
          type: DOCX,
          name: 'contract.docx',
          data: branchOnlyFile,
        });
      });

      it('handles Blob from fetch response', async () => {
        createAppHarness();

        // Simulates fetch().then(res => res.blob())
        const blob = new Blob(['content'], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        const instance = new SuperDoc({
          selector: '#host',
          document: blob,
        });
        await flushMicrotasks();

        expect(instance.config.documents).toHaveLength(1);
        expect(instance.config.documents[0]).toMatchObject({
          id: expect.any(String),
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          name: 'document', // Default name for Blobs
        });
        // isNewFile should NOT be set when importing existing files
        expect(instance.config.documents[0].isNewFile).toBeUndefined();
        // Blob should be wrapped as File
        expect(instance.config.documents[0].data).toBeInstanceOf(File);
      });

      it('handles File with empty type (browser edge case)', async () => {
        createAppHarness();

        // Some browsers can't determine MIME type
        const file = new File(['content'], 'report.docx', { type: '' });

        const instance = new SuperDoc({
          selector: '#host',
          document: file,
        });
        await flushMicrotasks();

        expect(instance.config.documents).toHaveLength(1);
        // Should infer type from filename
        expect(instance.config.documents[0].type).toBe(DOCX);
      });

      it('handles Blob without type', async () => {
        createAppHarness();

        // Untyped Blob (edge case)
        const blob = new Blob(['content']);

        const instance = new SuperDoc({
          selector: '#host',
          document: blob,
        });
        await flushMicrotasks();

        expect(instance.config.documents).toHaveLength(1);
        // Should default to DOCX
        expect(instance.config.documents[0].type).toBe(DOCX);
        expect(instance.config.documents[0].name).toBe('document');
      });
    });

    describe('ID generation', () => {
      it('generates IDs for all document types', async () => {
        createAppHarness();

        const testCases = [
          // URL string
          { document: 'https://example.com/doc.docx' },
          // File
          { document: new File(['test'], 'test.docx', { type: DOCX }) },
          // Blob
          { document: new Blob(['test'], { type: DOCX }) },
          // Config object
          { document: { data: new Blob(['test']), name: 'test.html', type: 'text/html' } },
        ];

        for (const config of testCases) {
          const instance = new SuperDoc({
            selector: '#host',
            ...config,
          });
          await flushMicrotasks();

          expect(instance.config.documents[0].id).toBeDefined();
          expect(instance.config.documents[0].id).toMatch(/^(uuid-1234|doc-)/);
        }
      });

      it('leaves non-object entries untouched when normalizing arrays', async () => {
        createAppHarness();

        const instance = new SuperDoc({
          selector: '#host',
          documents: [null, { type: DOCX, data: new Blob(['test'], { type: DOCX }), name: 'doc.docx' }],
        });
        await flushMicrotasks();

        expect(instance.config.documents[0]).toBeNull();
        expect(instance.config.documents[1]).toMatchObject({
          id: 'uuid-1234',
          type: DOCX,
          name: 'doc.docx',
        });
      });

      it('preserves existing IDs in documents array', async () => {
        createAppHarness();

        const instance = new SuperDoc({
          selector: '#host',
          documents: [
            { id: 'custom-id-1', type: DOCX, data: new Blob(['test']) },
            { type: DOCX, url: 'test.docx' }, // No ID
          ],
        });
        await flushMicrotasks();

        expect(instance.config.documents[0].id).toBe('custom-id-1');
        expect(instance.config.documents[1].id).toBeDefined();
        expect(instance.config.documents[1].id).not.toBe('custom-id-1');
      });
    });

    describe('backward compatibility', () => {
      it('still handles document config objects', async () => {
        createAppHarness();

        const blob = new Blob(['test'], { type: DOCX });
        const instance = new SuperDoc({
          selector: '#host',
          document: {
            data: blob,
            name: 'custom.docx',
            type: DOCX,
          },
        });
        await flushMicrotasks();

        expect(instance.config.documents).toHaveLength(1);
        expect(instance.config.documents[0]).toMatchObject({
          id: expect.any(String),
          type: DOCX,
          name: 'custom.docx',
          // Note: isNewFile is not added when passing config objects
          // only when passing File/Blob directly
        });
      });

      it('handles document config with isNewFile flag', async () => {
        createAppHarness();

        const blob = new Blob(['test'], { type: DOCX });
        const instance = new SuperDoc({
          selector: '#host',
          document: {
            data: blob,
            name: 'custom.docx',
            type: DOCX,
            isNewFile: true, // Explicitly set
          },
        });
        await flushMicrotasks();

        expect(instance.config.documents[0]).toMatchObject({
          id: expect.any(String),
          type: DOCX,
          name: 'custom.docx',
          isNewFile: true,
        });
      });
    });
  });

  describe('Zoom API', () => {
    it('getZoom returns 100 by default', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      expect(instance.getZoom()).toBe(100);
    });

    it('getZoom returns current activeZoom from store', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      superdocStore.activeZoom = 150;
      expect(instance.getZoom()).toBe(150);

      superdocStore.activeZoom = 75;
      expect(instance.getZoom()).toBe(75);
    });

    it('setZoom updates activeZoom in the store', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      instance.setZoom(150);

      expect(superdocStore.activeZoom).toBe(150);
    });

    it('setZoom propagates multiplier through activeZoom watcher', async () => {
      const { superdocStore } = createAppHarness();
      const mockPresentationEditor = {
        zoom: 1,
        setZoom: vi.fn(),
      };

      superdocStore.documents = [
        {
          id: 'doc-1',
          type: DOCX,
          getPresentationEditor: vi.fn(() => mockPresentationEditor),
        },
      ];

      // Simulate SuperDoc.vue's activeZoom watcher
      let activeZoom = 100;
      Object.defineProperty(superdocStore, 'activeZoom', {
        configurable: true,
        get: () => activeZoom,
        set: (value) => {
          activeZoom = value;
          const zoomMultiplier = (value ?? 100) / 100;
          superdocStore.documents.forEach((doc) => {
            const presentationEditor = doc.getPresentationEditor?.();
            presentationEditor?.setZoom?.(zoomMultiplier);
          });
        },
      });

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        colors: ['red'],
        user: { name: 'Jane', email: 'jane@example.com' },
      });
      await flushMicrotasks();

      instance.setZoom(150);

      expect(mockPresentationEditor.setZoom).toHaveBeenCalledWith(1.5);
      expect(superdocStore.activeZoom).toBe(150);
    });

    it('setZoom emits zoomChange event', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const zoomChangeSpy = vi.fn();
      instance.on('zoomChange', zoomChangeSpy);

      instance.setZoom(200);

      expect(zoomChangeSpy).toHaveBeenCalledWith({ zoom: 200, mode: 'manual' });
    });

    it('setZoom switches zoom mode to manual', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      superdocStore.zoomMode = 'fit-width';
      instance.setZoom(125);

      expect(superdocStore.zoomMode).toBe('manual');
      expect(instance.getZoomState().mode).toBe('manual');
    });

    it('setZoomMode switches between manual and fit-width and rejects invalid values', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      instance.setZoomMode('fit-width');
      expect(superdocStore.zoomMode).toBe('fit-width');

      instance.setZoomMode('manual');
      expect(superdocStore.zoomMode).toBe('manual');

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      instance.setZoomMode('fit-page');
      expect(superdocStore.zoomMode).toBe('manual');
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('setZoom and setZoomMode before initialization warn and emit nothing', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      // No flushMicrotasks: async #init has not attached superdocStore yet.
      const zoomChangeSpy = vi.fn();
      instance.on('zoomChange', zoomChangeSpy);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      instance.setZoom(150);
      instance.setZoomMode('fit-width');

      // Neither call may advertise a change that was never persisted.
      expect(zoomChangeSpy).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();

      await flushMicrotasks();
      expect(instance.getZoom()).toBe(100);
      expect(instance.getZoomState().mode).toBe('manual');
    });

    it('setZoomMode emits zoomChange for mode-only transitions and no-ops on the same mode', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const zoomChangeSpy = vi.fn();
      instance.on('zoomChange', zoomChangeSpy);

      // Mode change with an unchanged value is observable.
      instance.setZoomMode('fit-width');
      expect(zoomChangeSpy).toHaveBeenCalledWith({ zoom: 100, mode: 'fit-width' });
      expect(zoomChangeSpy).toHaveBeenCalledTimes(1);

      // Same-mode call is a no-op: no state churn, no event.
      instance.setZoomMode('fit-width');
      expect(zoomChangeSpy).toHaveBeenCalledTimes(1);

      instance.setZoomMode('manual');
      expect(zoomChangeSpy).toHaveBeenCalledWith({ zoom: 100, mode: 'manual' });
      expect(zoomChangeSpy).toHaveBeenCalledTimes(2);
    });

    it('getZoomState reports mode, value, fitZoom, and effective bounds', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        zoom: { fitWidth: { min: 35, max: 150 } },
      });
      await flushMicrotasks();

      expect(instance.getZoomState()).toEqual({
        mode: 'manual',
        value: 100,
        fitZoom: null,
        min: 35,
        max: 150,
      });

      superdocStore.zoomMode = 'fit-width';
      superdocStore.activeZoom = 74;
      superdocStore.viewportMetrics = { availableWidth: 600, documentWidth: 816, fitZoom: 74 };

      expect(instance.getZoomState()).toEqual({
        mode: 'fit-width',
        value: 74,
        fitZoom: 74,
        min: 35,
        max: 150,
      });
    });

    it('getZoomState falls back to default bounds and reorders swapped min/max', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        zoom: { fitWidth: { min: 150, max: 35 } },
      });
      await flushMicrotasks();

      const state = instance.getZoomState();
      expect(state.min).toBe(35);
      expect(state.max).toBe(150);

      const defaultsInstance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const defaults = defaultsInstance.getZoomState();
      expect(defaults.min).toBe(10);
      expect(defaults.max).toBe(100);
    });

    it('getZoomState uses default bounds for invalid fit-width fields', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        zoom: { fitWidth: { min: 'narrow', max: -1, padding: 'wide' } },
      });
      await flushMicrotasks();

      expect(instance.getZoomState()).toMatchObject({
        min: 10,
        max: 100,
      });
    });

    it('getViewportMetrics returns null before the first measurement, then the stored metrics', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      expect(instance.getViewportMetrics()).toBeNull();

      const metrics = { availableWidth: 935, documentWidth: 816, fitZoom: 115 };
      superdocStore.viewportMetrics = metrics;

      expect(instance.getViewportMetrics()).toEqual(metrics);
    });

    it('getZoom reflects value set by setZoom', async () => {
      const { superdocStore } = createAppHarness();

      // Simulate SuperDoc.vue's activeZoom watcher
      let activeZoom = 100;
      Object.defineProperty(superdocStore, 'activeZoom', {
        configurable: true,
        get: () => activeZoom,
        set: (value) => {
          activeZoom = value;
          const zoomMultiplier = (value ?? 100) / 100;
          superdocStore.documents.forEach((doc) => {
            const presentationEditor = doc.getPresentationEditor?.();
            presentationEditor?.setZoom?.(zoomMultiplier);
          });
        },
      });

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      instance.setZoom(75);
      expect(instance.getZoom()).toBe(75);

      instance.setZoom(200);
      expect(instance.getZoom()).toBe(200);
    });

    it('setZoom avoids duplicate presentation-editor updates when activeZoom store watcher also applies zoom', async () => {
      const { superdocStore } = createAppHarness();
      const mockPresentationEditor = { zoom: 1, setZoom: vi.fn() };

      superdocStore.documents = [
        {
          id: 'doc-1',
          type: DOCX,
          getPresentationEditor: vi.fn(() => mockPresentationEditor),
        },
      ];

      // Simulate SuperDoc.vue's activeZoom watcher:
      // watch(activeZoom, zoom => PresentationEditor.setGlobalZoom(zoom / 100))
      let activeZoom = 100;
      Object.defineProperty(superdocStore, 'activeZoom', {
        configurable: true,
        get: () => activeZoom,
        set: (value) => {
          activeZoom = value;
          const zoomMultiplier = (value ?? 100) / 100;
          superdocStore.documents.forEach((doc) => {
            const presentationEditor = doc.getPresentationEditor?.();
            presentationEditor?.setZoom?.(zoomMultiplier);
          });
        },
      });

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        colors: ['red'],
        user: { name: 'Jane', email: 'jane@example.com' },
      });
      await flushMicrotasks();

      instance.setZoom(125);

      expect(mockPresentationEditor.setZoom).toHaveBeenCalledTimes(1);
      expect(mockPresentationEditor.setZoom).toHaveBeenCalledWith(1.25);
    });

    it('activeZoom watcher routes to PresentationEditor', async () => {
      const { superdocStore } = createAppHarness();
      const mockPresentationEditor = { zoom: 1, setZoom: vi.fn() };

      superdocStore.documents = [
        {
          id: 'doc-1',
          type: DOCX,
          getPresentationEditor: vi.fn(() => mockPresentationEditor),
        },
      ];

      let activeZoom = 100;
      Object.defineProperty(superdocStore, 'activeZoom', {
        configurable: true,
        get: () => activeZoom,
        set: (value) => {
          activeZoom = value;
          const zoomMultiplier = (value ?? 100) / 100;
          superdocStore.documents.forEach((doc) => {
            const presentationEditor = doc.getPresentationEditor?.();
            presentationEditor?.setZoom?.(zoomMultiplier);
          });
        },
      });

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      instance.setZoom(125);
      expect(mockPresentationEditor.setZoom).toHaveBeenCalledTimes(1);
      expect(mockPresentationEditor.setZoom).toHaveBeenCalledWith(1.25);
    });

    it('setZoom warns and returns early for invalid values', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const zoomChangeSpy = vi.fn();
      instance.on('zoomChange', zoomChangeSpy);

      // Test negative value
      instance.setZoom(-50);
      expect(warnSpy).toHaveBeenCalledWith('[SuperDoc] setZoom expects a positive number representing percentage');
      expect(superdocStore.activeZoom).toBe(100);
      expect(zoomChangeSpy).not.toHaveBeenCalled();

      warnSpy.mockClear();

      // Test zero
      instance.setZoom(0);
      expect(warnSpy).toHaveBeenCalled();
      expect(superdocStore.activeZoom).toBe(100);

      warnSpy.mockClear();

      // Test non-number
      instance.setZoom('150');
      expect(warnSpy).toHaveBeenCalled();
      expect(superdocStore.activeZoom).toBe(100);

      warnSpy.mockClear();

      // Test NaN
      instance.setZoom(NaN);
      expect(warnSpy).toHaveBeenCalled();
      expect(superdocStore.activeZoom).toBe(100);

      warnSpy.mockClear();

      // Test Infinity
      instance.setZoom(Infinity);
      expect(warnSpy).toHaveBeenCalled();
      expect(superdocStore.activeZoom).toBe(100);

      warnSpy.mockRestore();
    });
  });

  describe('Web layout mode configuration', () => {
    it('keeps PM fallback when web layout is enabled without semantic flow mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        viewOptions: { layout: 'web' },
        useLayoutEngine: true,
      });
      await flushMicrotasks();

      expect(warnSpy).toHaveBeenCalledWith(
        "[SuperDoc] Web layout uses PM fallback unless layoutEngineOptions.flowMode is set to 'semantic'. Automatically disabling layout engine.",
      );
      expect(instance.config.useLayoutEngine).toBe(false);
      warnSpy.mockRestore();
    });

    it('does not warn when web layout with layout engine already disabled', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        viewOptions: { layout: 'web' },
        useLayoutEngine: false,
      });
      await flushMicrotasks();

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout uses PM fallback'));
      expect(instance.config.useLayoutEngine).toBe(false);
      warnSpy.mockRestore();
    });

    it('keeps layout engine enabled when semantic flow mode is explicitly requested in web layout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        viewOptions: { layout: 'web' },
        useLayoutEngine: true,
        layoutEngineOptions: {
          flowMode: 'semantic',
        },
      });
      await flushMicrotasks();

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout uses PM fallback'));
      expect(instance.config.useLayoutEngine).toBe(true);
      warnSpy.mockRestore();
    });

    it('coerces semantic flowMode to paginated when layout is not web', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        viewOptions: { layout: 'print' },
        useLayoutEngine: true,
        layoutEngineOptions: {
          flowMode: 'semantic',
        },
      });
      await flushMicrotasks();

      expect(warnSpy).toHaveBeenCalledWith(
        "[SuperDoc] flowMode 'semantic' is only valid with web layout. Coercing to 'paginated'.",
      );
      expect(instance.config.layoutEngineOptions.flowMode).toBe('paginated');
      expect(instance.config.useLayoutEngine).toBe(true);
      warnSpy.mockRestore();
    });

    it('preserves layout engine setting for print layout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        viewOptions: { layout: 'print' },
        useLayoutEngine: true,
      });
      await flushMicrotasks();

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout uses PM fallback'));
      expect(instance.config.useLayoutEngine).toBe(true);
      warnSpy.mockRestore();
    });

    it('uses default print layout when viewOptions not specified', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      expect(instance.config.viewOptions).toEqual({ layout: 'print' });
      expect(instance.config.useLayoutEngine).toBe(true);
    });

    it('handles undefined viewOptions.layout gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        viewOptions: {},
        useLayoutEngine: true,
      });
      await flushMicrotasks();

      // Should not trigger web layout warning
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout uses PM fallback'));
      expect(instance.config.useLayoutEngine).toBe(true);
      warnSpy.mockRestore();
    });
  });

  describe('pagination-update event', () => {
    it('registers onPaginationUpdate listener during init', async () => {
      createAppHarness();
      const onPaginationUpdate = vi.fn();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        onPaginationUpdate,
      });
      await flushMicrotasks();

      instance.emit('pagination-update', { totalPages: 5, superdoc: instance });
      expect(onPaginationUpdate).toHaveBeenCalledWith({ totalPages: 5, superdoc: instance });
    });

    it('defaults onPaginationUpdate to a no-op', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      // Should not throw when emitting without a user callback
      expect(() => {
        instance.emit('pagination-update', { totalPages: 3, superdoc: instance });
      }).not.toThrow();
    });
  });

  describe('Surface API (openSurface / closeSurface)', () => {
    const StubComponent = { template: '<div>stub</div>' };

    it('openSurface returns a handle with id, mode, close, and result', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const handle = instance.openSurface({ mode: 'dialog', component: StubComponent });
      expect(handle.id).toBeDefined();
      expect(handle.mode).toBe('dialog');
      expect(typeof handle.close).toBe('function');
      expect(handle.result).toBeInstanceOf(Promise);
    });

    it('closeSurface closes the active dialog', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const handle = instance.openSurface({ mode: 'dialog', component: StubComponent });
      instance.closeSurface(handle.id);

      const outcome = await handle.result;
      expect(outcome.status).toBe('closed');
    });

    it('closeSurface with no args closes topmost surface', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const handle = instance.openSurface({ mode: 'dialog', component: StubComponent });
      instance.closeSurface();

      const outcome = await handle.result;
      expect(outcome.status).toBe('closed');
    });

    it('openSurface throws synchronously for invalid requests', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      expect(() => instance.openSurface({ mode: 'dialog' })).toThrow(/must provide/);
    });

    it('destroy settles active surfaces with destroyed status', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      const handle = instance.openSurface({ mode: 'floating', component: StubComponent });
      instance.destroy();

      const outcome = await handle.result;
      expect(outcome.status).toBe('destroyed');
    });
  });

  describe('canPerformPermission', () => {
    it('returns false when no permission is passed', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      expect(instance.canPerformPermission()).toBe(false);
      expect(instance.canPerformPermission({})).toBe(false);
      expect(instance.canPerformPermission({ permission: '' })).toBe(false);
    });

    it('uses config.role and config.isInternal as defaults when caller omits them', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'editor',
        isInternal: true,
      });
      await flushMicrotasks();

      // RESOLVE_OWN is granted to editor on internal documents per the matrix.
      expect(instance.canPerformPermission({ permission: 'RESOLVE_OWN' })).toBe(true);
    });

    it('returns false when a viewer asks for an editor-only permission', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'viewer',
        isInternal: true,
      });
      await flushMicrotasks();

      expect(instance.canPerformPermission({ permission: 'RESOLVE_OWN' })).toBe(false);
    });

    it('honors a per-call role override regardless of config.role', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'viewer',
        isInternal: true,
      });
      await flushMicrotasks();

      expect(instance.canPerformPermission({ permission: 'RESOLVE_OWN', role: 'editor' })).toBe(true);
    });

    it('lets a config.permissionResolver override the default decision', async () => {
      createAppHarness();

      const resolver = vi.fn(() => false);
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'editor',
        isInternal: true,
        permissionResolver: resolver,
      });
      await flushMicrotasks();

      // Editor would normally be granted; the resolver overrides to false.
      expect(instance.canPerformPermission({ permission: 'RESOLVE_OWN' })).toBe(false);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({
          permission: 'RESOLVE_OWN',
          role: 'editor',
          isInternal: true,
          defaultDecision: true,
        }),
      );
    });

    it('falls back to the default decision when resolver returns a non-boolean', async () => {
      createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'viewer',
        isInternal: true,
        permissionResolver: () => undefined,
      });
      await flushMicrotasks();

      // viewer is denied RESOLVE_OWN by default; resolver returning undefined
      // must not flip that to true.
      expect(instance.canPerformPermission({ permission: 'RESOLVE_OWN' })).toBe(false);
    });

    it('forwards comment and trackedChange payloads to the resolver', async () => {
      createAppHarness();

      const resolver = vi.fn(() => true);
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'editor',
        isInternal: true,
        permissionResolver: resolver,
      });
      await flushMicrotasks();

      const comment = { id: 'c-1', body: 'note' };
      const trackedChange = { id: 'tc-1', type: 'insert', commentId: 'c-1' };

      instance.canPerformPermission({ permission: 'RESOLVE_OWN', comment, trackedChange });

      expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ comment, trackedChange }));
    });

    it('resolves comment from commentsStore.getComment when trackedChange supplies only an id', async () => {
      const { commentsStore } = createAppHarness();
      const stored = { id: 'c-7', body: 'looked up' };
      commentsStore.getComment = vi.fn(() => stored);

      const resolver = vi.fn(() => true);
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'editor',
        isInternal: true,
        permissionResolver: resolver,
      });
      await flushMicrotasks();

      // No `comment` passed; trackedChange only carries the id. The method
      // must fall through to `commentsStore.getComment(commentId)`.
      const trackedChange = { commentId: 'c-7', type: 'insert' };
      instance.canPerformPermission({ permission: 'RESOLVE_OWN', trackedChange });

      expect(commentsStore.getComment).toHaveBeenCalledWith('c-7');
      expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ comment: stored, trackedChange }));
    });

    it('unwraps a stored comment via getValues() when present', async () => {
      const { commentsStore } = createAppHarness();
      const unwrapped = { id: 'c-9', body: 'unwrapped' };
      commentsStore.getComment = vi.fn(() => ({ getValues: () => unwrapped }));

      const resolver = vi.fn(() => true);
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        role: 'editor',
        isInternal: true,
        permissionResolver: resolver,
      });
      await flushMicrotasks();

      const trackedChange = { id: 'tc-9', type: 'delete' };
      instance.canPerformPermission({ permission: 'RESOLVE_OWN', trackedChange });

      // The store returned a wrapper with `getValues()`; the method must
      // unwrap it before forwarding to the resolver.
      expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ comment: unwrapped }));
    });
  });

  // ---------------------------------------------------------------------------
  // SD-2916 PR-A: safe field defaults for delayed-init fields
  // ---------------------------------------------------------------------------
  //
  // These tests pin the "before ready" contract for the four fields PR-A
  // initializes at the field declaration (or in the constructor body for
  // `#surfaceManager`). The async `#init` overwrites some of these later,
  // but consumers reading them immediately after `new SuperDoc(...)` and
  // before the `ready` event must see a usable value, not `undefined`.

  describe('SD-2916 PR-A: safe field defaults', () => {
    it('initializes `whiteboard` to null immediately after construction', () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        user: { name: 'Jane', email: 'jane@example.com' },
      });

      // Whiteboard is constructed in `#initWhiteboard()` after the
      // collaboration await; before that it must be a stable null.
      expect(instance.whiteboard).toBeNull();
    });

    it('exposes `openSurface` immediately after construction (SurfaceManager constructed in ctor body)', () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        user: { name: 'Jane', email: 'jane@example.com' },
      });

      // The handle returned must be a real object with `id`, `result`,
      // `close`, etc. — not throw `Cannot read properties of undefined`.
      const handle = instance.openSurface({ mode: 'dialog', render: () => null });
      expect(handle).toBeDefined();
      expect(typeof handle.id).toBe('string');
      expect(typeof handle.close).toBe('function');
      expect(handle.result).toBeInstanceOf(Promise);
      // Resolve the handle to keep the surface registry clean for other tests.
      handle.close({ status: 'cancelled' });
    });

    it('`version` is the injected build-time constant, not the placeholder', () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        user: { name: 'Jane', email: 'jane@example.com' },
      });

      // The field declaration seeds `'0.0.0'` so the field is
      // structurally assigned, then `#init` synchronously overwrites
      // with `__APP_VERSION__` (vite injects this in both dev/test and
      // build config). Assert the overwrite happened — a regression
      // that drops the overwrite would leave the placeholder visible.
      expect(typeof instance.version).toBe('string');
      expect(instance.version).not.toBe('0.0.0');
    });

    it('skips the toolbar exception bridge when onException is explicitly undefined', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        onException: undefined,
      });

      await flushMicrotasks();

      expect(instance.toolbar.listeners.exception).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // SD-2916 PR-B: lifecycle guards on ready-required methods
  // ---------------------------------------------------------------------------
  //
  // PR-B types the remaining 5 delayed-init fields (superdocStore,
  // commentsStore, highContrastModeStore, app, pinia) as `T | undefined`
  // and adds `#requireSuperdocStore` / `#requireCommentsStore` /
  // `#requireReady` helpers. Public methods that genuinely need the
  // runtime to be ready (state, requiredNumberOfEditors, addSharedUser,
  // removeSharedUser, focus, export*, setDocumentMode) now throw a
  // clear "wait for the ready event" error instead of failing with a
  // generic TypeError. Pre-ready safe paths (getComment,
  // setHighContrastMode without an active editor, destroy()) still
  // work without throwing.

  describe('SD-2916 PR-B: lifecycle guards', () => {
    const basePreReadyConfig = () => ({
      selector: '#host',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      user: { name: 'Jane', email: 'jane@example.com' },
    });

    it('addSharedUser before ready throws a clear lifecycle error', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      // No `await flushMicrotasks()`: fields populated by `#initVueApp`
      // are still undefined here, so the `#requireReady` guard fires.
      expect(() => instance.addSharedUser({ name: 'Bob', email: 'b@x.com' })).toThrow(
        /SuperDoc: addSharedUser requires the instance to be ready/,
      );
    });

    it('removeSharedUser before ready throws a clear lifecycle error', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      expect(() => instance.removeSharedUser('b@x.com')).toThrow(
        /SuperDoc: removeSharedUser requires the instance to be ready/,
      );
    });

    it('reading the `state` getter before ready throws a clear lifecycle error', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      expect(() => instance.state).toThrow(/SuperDoc: state requires the instance to be ready/);
    });

    it('reading `requiredNumberOfEditors` before ready throws a clear lifecycle error', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      expect(() => instance.requiredNumberOfEditors).toThrow(
        /SuperDoc: requiredNumberOfEditors requires the instance to be ready/,
      );
    });

    it('destroy() before ready does not throw (existing `if (this.app)` guard still applies)', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      // Pre-ready destroy is a valid usage path: a consumer who decides
      // to tear down while async init is still in flight should not see
      // a runtime error.
      expect(() => instance.destroy()).not.toThrow();
    });

    it('getComment() before ready returns null (optional-chain path preserved)', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      // `getComment` already early-returns via `?.` on `commentsStore`,
      // so a pre-ready call returns null instead of throwing.
      expect(instance.getComment('any-id')).toBeNull();
    });

    it('setHighContrastMode() before ready no-ops (gated by activeEditor)', () => {
      createAppHarness();
      const instance = new SuperDoc(basePreReadyConfig());

      // The existing `if (!this.activeEditor) return` guard short-circuits
      // before either `activeEditor.setHighContrastMode` or
      // `highContrastModeStore.setHighContrastMode` is touched.
      expect(() => instance.setHighContrastMode(true)).not.toThrow();
    });

    it('toggleRuler() before ready throws and leaves config.rulers unchanged', () => {
      createAppHarness();
      const instance = new SuperDoc({ ...basePreReadyConfig(), rulers: true });

      // Guard fires before the `this.config.rulers = !this.config.rulers`
      // mutation, so a failed pre-ready call must leave the config
      // untouched (otherwise a consumer retry would see a flipped value).
      const before = instance.config.rulers;
      expect(() => instance.toggleRuler()).toThrow(/SuperDoc: toggleRuler requires the instance to be ready/);
      expect(instance.config.rulers).toBe(before);
    });

    it("setDocumentMode('viewing') before ready throws and leaves config.documentMode unchanged", () => {
      createAppHarness();
      const instance = new SuperDoc({ ...basePreReadyConfig(), documentMode: 'editing' });

      const before = instance.config.documentMode;
      expect(() => instance.setDocumentMode('viewing')).toThrow(
        /SuperDoc: setDocumentMode requires the instance to be ready/,
      );
      expect(instance.config.documentMode).toBe(before);
    });
  });

  describe('editor runtime registry integration', () => {
    const makeFakeEditor = (documentId = 'doc-1', selectionText = '') => {
      const handlers = new Map();
      return {
        options: { documentId },
        state: {
          doc: { textBetween: () => selectionText },
          selection: { from: 0, to: selectionText.length, empty: selectionText.length === 0 },
        },
        commands: {
          insertContent: vi.fn(() => true),
          search: vi.fn(() => [{ documentId }]),
          goToSearchResult: vi.fn(() => true),
        },
        view: { focus: vi.fn() },
        focus: vi.fn(),
        on(event, handler) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(handler);
        },
        off(event, handler) {
          handlers.get(event)?.delete(handler);
        },
        emit(event, ...args) {
          for (const handler of Array.from(handlers.get(event) ?? [])) handler(...args);
        },
        async exportDocx() {
          return new ArrayBuffer(0);
        },
      };
    };

    it('projects activeEditor from a v1 runtime and rebinds the toolbar on activation', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
      });
      await flushMicrotasks();

      toolbarSetActiveSpy.mockClear();
      const runtime = createFakeV1Runtime({ id: 'v1-a', documentId: 'doc-1', root: document.createElement('div') });

      instance.registerEditorRuntime(runtime);
      instance.setActiveRuntime('v1-a', 'focus');

      expect(instance.activeEditor).toMatchObject({ legacy: 'v1-editor' });
      expect(toolbarSetActiveSpy).toHaveBeenCalledWith(instance.activeEditor);
      expect(instance.activeEditor.toolbar).toBe(instance.toolbar);
      expect(instance.getActiveRuntime()).toBe(runtime);
    });

    it('unregistering the active runtime clears activeEditor without promoting another runtime', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
      });
      await flushMicrotasks();

      const a = createFakeV1Runtime({ id: 'v1-a', documentId: 'doc-a', root: document.createElement('div') });
      const b = createFakeV1Runtime({ id: 'v1-b', documentId: 'doc-b', root: document.createElement('div') });
      instance.registerEditorRuntime(a);
      instance.registerEditorRuntime(b);
      instance.setActiveRuntime('v1-a', 'focus');

      instance.unregisterEditorRuntime('v1-a');

      expect(instance.getActiveRuntime()).toBeNull();
      expect(instance.activeEditor).toBeNull();
      expect(instance.toolbar.activeEditor).toBeNull();
    });

    it('focus routes through the active v1 runtime adapter when one is active', async () => {
      createAppHarness();
      const instance = new SuperDoc({ selector: '#host', document: 'https://example.com/doc.docx' });
      await flushMicrotasks();

      const editor = makeFakeEditor();
      const { runtime, attachPresentationEditor } = createV1EditorRuntimeAdapter({
        id: 'v1-focus',
        documentId: 'doc-1',
        root: document.createElement('div'),
        editor,
      });
      const presentationFocus = vi.fn();
      attachPresentationEditor({ focus: presentationFocus, setZoom: vi.fn(), on: vi.fn(), off: vi.fn() });

      instance.registerEditorRuntime(runtime);
      instance.setActiveRuntime('v1-focus', 'v1-editor-create');
      instance.focus();

      expect(presentationFocus).toHaveBeenCalledTimes(1);
      expect(editor.focus).not.toHaveBeenCalled();
    });

    it('focus falls back to the active legacy editor when no focusable runtime is active', async () => {
      createAppHarness();
      const instance = new SuperDoc({ selector: '#host', document: 'https://example.com/doc.docx' });
      await flushMicrotasks();

      const focus = vi.fn();
      instance.activeEditor = { focus };

      instance.focus();

      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('focus warns when the active runtime rejects focus', async () => {
      createAppHarness();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const instance = new SuperDoc({ selector: '#host', document: 'https://example.com/doc.docx' });
      await flushMicrotasks();

      const focusError = new Error('focus failed');
      const runtime = createFakeV1Runtime({
        id: 'v1-focus-fail',
        documentId: 'doc-1',
        root: document.createElement('div'),
      });
      vi.spyOn(runtime, 'focus').mockRejectedValue(focusError);

      try {
        instance.registerEditorRuntime(runtime);
        instance.setActiveRuntime('v1-focus-fail', 'focus');

        instance.focus();
        await flushMicrotasks();

        expect(warnSpy).toHaveBeenCalledWith('[SuperDoc] active editor runtime focus failed', focusError);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('focus falls back to the first document editor when no runtime or active editor is available', async () => {
      const { superdocStore } = createAppHarness();
      const instance = new SuperDoc({ selector: '#host', document: 'https://example.com/doc.docx' });
      await flushMicrotasks();

      const firstFocus = vi.fn();
      const secondFocus = vi.fn();
      superdocStore.documents = [
        { id: 'doc-a', getEditor: vi.fn(() => null) },
        { id: 'doc-b', getEditor: vi.fn(() => ({ focus: firstFocus })) },
        { id: 'doc-c', getEditor: vi.fn(() => ({ focus: secondFocus })) },
      ];

      instance.focus();

      expect(firstFocus).toHaveBeenCalledTimes(1);
      expect(secondFocus).not.toHaveBeenCalled();
    });

    it('event-target activation routes shell commands to the selected v1 root', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
      });
      await flushMicrotasks();

      const rootA = document.createElement('div');
      const rootB = document.createElement('div');
      const innerA = document.createElement('span');
      const innerB = document.createElement('span');
      rootA.appendChild(innerA);
      rootB.appendChild(innerB);
      document.body.append(rootA, rootB);

      const editorA = makeFakeEditor('doc-a', 'alpha selection');
      const editorB = makeFakeEditor('doc-b', 'beta selection');
      const a = createV1EditorRuntimeAdapter({
        id: 'v1:doc-a',
        documentId: 'doc-a',
        root: rootA,
        editor: editorA,
        onUnregister: (id) => instance.unregisterEditorRuntime(id),
      });
      const b = createV1EditorRuntimeAdapter({
        id: 'v1:doc-b',
        documentId: 'doc-b',
        root: rootB,
        editor: editorB,
        onUnregister: (id) => instance.unregisterEditorRuntime(id),
      });

      try {
        markRuntimeRoot(rootA, a.runtime.id);
        markRuntimeRoot(rootB, b.runtime.id);
        instance.registerEditorRuntime(a.runtime);
        instance.registerEditorRuntime(b.runtime);

        instance.activateRuntimeFromEventTarget(innerA, 'focusin');
        expect(instance.getActiveRuntime()).toBe(a.runtime);
        expect(instance.activeEditor).toBe(editorA);
        instance.search('alpha');
        expect(editorA.commands.search).toHaveBeenCalledWith('alpha', { searchModel: 'visible' });
        expect(editorB.commands.search).not.toHaveBeenCalled();

        instance.activateRuntimeFromEventTarget(innerB, 'pointerdown');
        expect(instance.getActiveRuntime()).toBe(b.runtime);
        expect(instance.activeEditor).toBe(editorB);
        instance.search('beta');
        expect(editorB.commands.search).toHaveBeenCalledWith('beta', { searchModel: 'visible' });
        expect(editorA.commands.search).toHaveBeenCalledTimes(1);

        expect(instance.getActiveRuntime().getSelectedText()).toBe('beta selection');
      } finally {
        rootA.remove();
        rootB.remove();
        instance.destroy();
      }
    });

    // The invariant SuperDoc owns: `activeEditor` is the active runtime's
    // command-capable projection, or null when the active runtime has no
    // supported legacy projection.
    const expectActiveEditorInvariant = (instance) => {
      const runtime = instance.getActiveRuntime();
      const projection = runtime?.getLegacyEditorProjection?.() ?? null;
      const supported =
        runtime?.kind === 'v1' &&
        !!projection &&
        typeof projection === 'object' &&
        !!projection.commands &&
        typeof projection.commands === 'object';
      expect(instance.activeEditor).toBe(supported ? projection : null);
    };

    const makeV1Adapter = (instance, id, documentId, selectionText = '') => {
      const editor = makeFakeEditor(documentId, selectionText);
      const adapter = createV1EditorRuntimeAdapter({
        id,
        documentId,
        root: document.createElement('div'),
        editor,
        onUnregister: (rid) => instance.unregisterEditorRuntime(rid),
      });
      instance.registerEditorRuntime(adapter.runtime);
      return { editor, adapter };
    };

    it('holds the activeEditor/active-runtime invariant across activation, switch, setActiveEditor, and unregister', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
      });
      await flushMicrotasks();

      const { editor: editorA } = makeV1Adapter(instance, 'v1-a', 'doc-a', 'alpha');
      const { editor: editorB, adapter: bAdapter } = makeV1Adapter(instance, 'v1-b', 'doc-b', 'beta');

      // Activation by runtime id.
      instance.setActiveRuntime('v1-a', 'focus');
      expect(instance.activeEditor).toBe(editorA);
      expectActiveEditorInvariant(instance);

      // Switching via the LEGACY entry point routes through the registry so the
      // active runtime follows activeEditor (no drift).
      instance.setActiveEditor(editorB);
      expect(instance.getActiveRuntime()).toBe(bAdapter.runtime);
      expect(instance.activeEditor).toBe(editorB);
      expectActiveEditorInvariant(instance);

      // Unregistering the active runtime clears activeEditor without promoting.
      instance.unregisterEditorRuntime('v1-b');
      expect(instance.getActiveRuntime()).toBeNull();
      expect(instance.activeEditor).toBeNull();
      expectActiveEditorInvariant(instance);
    });

    it('document-id fallback activates the runtime but keeps activeEditor on its canonical projection', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
      });
      await flushMicrotasks();

      const { editor: bodyEditor, adapter } = makeV1Adapter(instance, 'v1-a', 'doc-1');
      const sameDocumentEditor = makeFakeEditor('doc-1', 'header');

      instance.setActiveEditor(sameDocumentEditor);
      expect(instance.getActiveRuntime()).toBe(adapter.runtime);
      expect(instance.activeEditor).toBe(bodyEditor);
      expectActiveEditorInvariant(instance);

      // Repeat while already active to cover the idempotent registry path.
      instance.setActiveEditor(sameDocumentEditor);
      expect(instance.activeEditor).toBe(bodyEditor);
      expectActiveEditorInvariant(instance);
    });

    it('rebinds the v1 toolbar to the active runtime and detaches the previous editor', async () => {
      createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
      });
      await flushMicrotasks();

      const { editor: editorA } = makeV1Adapter(instance, 'v1-a', 'doc-a');
      const { editor: editorB } = makeV1Adapter(instance, 'v1-b', 'doc-b');

      instance.setActiveRuntime('v1-a', 'focus');
      expect(instance.toolbar.activeEditor).toBe(editorA);

      toolbarUpdateSpy.mockClear();
      instance.setActiveRuntime('v1-b', 'focus');
      expect(instance.toolbar.activeEditor).toBe(editorB);

      // The previous editor no longer drives the toolbar; only the new one does.
      editorA.emit('transaction');
      expect(toolbarUpdateSpy).not.toHaveBeenCalled();
      editorB.emit('transaction');
      expect(toolbarUpdateSpy).toHaveBeenCalledTimes(1);
    });

    it('activates the chosen runtime on editing/suggesting mode changes (no drift)', async () => {
      const { superdocStore } = createAppHarness();
      const editorA = makeFakeEditor('doc-1');
      editorA.setDocumentMode = vi.fn();
      superdocStore.documents = [
        {
          getEditor: vi.fn(() => editorA),
          getPresentationEditor: vi.fn(() => null),
          restoreComments: vi.fn(),
          removeComments: vi.fn(),
        },
      ];
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
        role: 'editor',
      });
      await flushMicrotasks();

      const adapter = createV1EditorRuntimeAdapter({
        id: 'v1-a',
        documentId: 'doc-1',
        root: document.createElement('div'),
        editor: editorA,
      });
      instance.registerEditorRuntime(adapter.runtime);

      instance.setDocumentMode('editing');
      expect(instance.getActiveRuntime()).toBe(adapter.runtime);
      expect(instance.activeEditor).toBe(editorA);
      expectActiveEditorInvariant(instance);

      instance.setDocumentMode('suggesting');
      expect(instance.getActiveRuntime()).toBe(adapter.runtime);
      expect(instance.activeEditor).toBe(editorA);
      expectActiveEditorInvariant(instance);
    });

    it('viewing-mode policy: keeps the active runtime + activeEditor, detaches only the toolbar', async () => {
      // Policy decision (documented + tested): viewing mode is read-only for the
      // toolbar, but search/navigation/read APIs must still resolve, so the
      // active runtime and `activeEditor` persist while the toolbar detaches.
      const { superdocStore } = createAppHarness();
      const editorA = makeFakeEditor('doc-1');
      editorA.setDocumentMode = vi.fn();
      superdocStore.documents = [
        {
          getEditor: vi.fn(() => editorA),
          getPresentationEditor: vi.fn(() => null),
          restoreComments: vi.fn(),
          removeComments: vi.fn(),
        },
      ];
      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        modules: { toolbar: {} },
        role: 'editor',
      });
      await flushMicrotasks();

      const adapter = createV1EditorRuntimeAdapter({
        id: 'v1-a',
        documentId: 'doc-1',
        root: document.createElement('div'),
        editor: editorA,
      });
      instance.registerEditorRuntime(adapter.runtime);

      instance.setDocumentMode('editing');
      expect(instance.activeEditor).toBe(editorA);

      instance.setDocumentMode('viewing');
      expect(instance.toolbar.activeEditor).toBeNull();
      expect(instance.getActiveRuntime()).toBe(adapter.runtime);
      expect(instance.activeEditor).toBe(editorA);

      toolbarUpdateSpy.mockClear();
      editorA.emit('transaction');
      expect(toolbarUpdateSpy).not.toHaveBeenCalled();

      instance.setDocumentMode('editing');
      expect(instance.toolbar.activeEditor).toBe(editorA);
      editorA.emit('transaction');
      expect(toolbarUpdateSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // SD-673: runtime event payload shapes
  // ---------------------------------------------------------------------------
  //
  // Pin the exact key set the runtime emits for each public event whose
  // Config callback has a named payload type (SuperDoc{Ready,Editor,Locked}
  // Payload). Existing tests use objectContaining({...}) which would not
  // catch a missing or extra field; these assertions catch the bug class
  // from #3503 where typed payloads silently drifted from what the runtime
  // emits.
  //
  // Each test:
  //   1. Registers superdoc.on(event, listener).
  //   2. Triggers the runtime emit path (the broadcast/lock method).
  //   3. Asserts Object.keys(payload).sort() matches the named type's
  //      key set, and each value has the expected runtime type.

  describe('SD-673: runtime event payload shapes', () => {
    const baseConfig = () => ({
      selector: '#host',
      document: 'https://example.com/doc.docx',
      documents: [],
      modules: { comments: {}, toolbar: {} },
      colors: ['red'],
      user: { name: 'Jane', email: 'jane@example.com' },
      onException: vi.fn(),
    });

    it("ready: payload key set is ['superdoc'] and value is the SuperDoc instance", async () => {
      const { superdocStore } = createAppHarness();
      superdocStore.documents = [{ type: DOCX, getEditor: vi.fn(() => ({})), setEditor: vi.fn() }];

      const instance = new SuperDoc(baseConfig());
      await flushMicrotasks();

      const received = [];
      instance.on('ready', (payload) => received.push(payload));

      instance.broadcastEditorCreate({});

      expect(received).toHaveLength(1);
      expect(Object.keys(received[0]).sort()).toEqual(['superdoc']);
      expect(received[0].superdoc).toBe(instance);
    });

    it("editorBeforeCreate: payload key set is ['editor']", async () => {
      createAppHarness();
      const instance = new SuperDoc(baseConfig());
      await flushMicrotasks();

      const received = [];
      instance.on('editorBeforeCreate', (payload) => received.push(payload));

      const editor = { id: 'editor-1' };
      instance.broadcastEditorBeforeCreate(editor);

      expect(received).toHaveLength(1);
      expect(Object.keys(received[0]).sort()).toEqual(['editor']);
      // editor is wrapped in createDeprecatedEditorProxy; the proxy is
      // transparent for property access, so identity-by-property holds.
      expect(received[0].editor.id).toBe('editor-1');
    });

    it("editorCreate: payload key set is ['editor']", async () => {
      createAppHarness();
      const instance = new SuperDoc(baseConfig());
      await flushMicrotasks();

      const received = [];
      instance.on('editorCreate', (payload) => received.push(payload));

      const editor = { id: 'editor-2' };
      instance.broadcastEditorCreate(editor);

      expect(received).toHaveLength(1);
      expect(Object.keys(received[0]).sort()).toEqual(['editor']);
      expect(received[0].editor.id).toBe('editor-2');
    });

    it("locked: payload key set is ['isLocked', 'lockedBy'] and lockedBy is User | null", async () => {
      createAppHarness();
      const instance = new SuperDoc(baseConfig());
      await flushMicrotasks();
      instance.config.documents = [];

      const received = [];
      instance.on('locked', (payload) => received.push(payload));

      // Lock with a user.
      instance.lockSuperdoc(true, { name: 'Admin', email: 'admin@x.com' });
      // Unlock (lockedBy is the implicit `null` default).
      instance.lockSuperdoc(false);

      expect(received).toHaveLength(2);

      expect(Object.keys(received[0]).sort()).toEqual(['isLocked', 'lockedBy']);
      expect(received[0]).toEqual({ isLocked: true, lockedBy: { name: 'Admin', email: 'admin@x.com' } });

      expect(Object.keys(received[1]).sort()).toEqual(['isLocked', 'lockedBy']);
      expect(received[1]).toEqual({ isLocked: false, lockedBy: null });
    });
  });
});
