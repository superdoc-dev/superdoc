import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOCX, PDF } from '@superdoc/common';

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
const toolbarSetZoomSpy = vi.fn();

class MockToolbar {
  constructor(config) {
    this.config = config;
    this.listeners = {};
    this.activeEditor = null;
    this.updateToolbarState = toolbarUpdateSpy;
  }

  on(event, handler) {
    this.listeners[event] = handler;
  }

  once(event, handler) {
    this.listeners[event] = handler;
  }

  setActiveEditor(editor) {
    this.activeEditor = editor;
    toolbarSetActiveSpy(editor);
  }

  setZoom(percent) {
    toolbarSetZoomSpy(percent);
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
    toolbarSetZoomSpy.mockClear();
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
      modules: { comments: {}, toolbar: {} },
      comments: { visible: true },
      trackChanges: { visible: true },
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

      expect(zoomChangeSpy).toHaveBeenCalledWith({ zoom: 200 });
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

    it('setZoom updates toolbar zoom UI for programmatic calls', async () => {
      const { superdocStore } = createAppHarness();
      const mockPresentationEditor = { zoom: 1, setZoom: vi.fn() };

      superdocStore.documents = [
        {
          id: 'doc-1',
          type: DOCX,
          getPresentationEditor: vi.fn(() => mockPresentationEditor),
        },
      ];

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
        documents: [],
        modules: { comments: {}, toolbar: {} },
        colors: ['red'],
        user: { name: 'Jane', email: 'jane@example.com' },
      });
      await flushMicrotasks();
      toolbarSetZoomSpy.mockClear();

      instance.setZoom(140);

      expect(toolbarSetZoomSpy).toHaveBeenCalledWith(140);
      expect(toolbarSetZoomSpy).toHaveBeenCalledTimes(1);
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

    it('setZoom is consistent with toolbar zoom command', async () => {
      const { superdocStore } = createAppHarness();

      const instance = new SuperDoc({
        selector: '#host',
        document: 'https://example.com/doc.docx',
      });
      await flushMicrotasks();

      // Programmatic API should update the same store property as the toolbar
      instance.setZoom(150);
      expect(superdocStore.activeZoom).toBe(150);

      // Simulate toolbar zoom (same path)
      instance.onToolbarCommand({ item: { command: 'setZoom' }, argument: 200 });
      expect(superdocStore.activeZoom).toBe(200);
      expect(instance.getZoom()).toBe(200);
    });
  });

  describe('Web layout mode configuration', () => {
    it('auto-disables layout engine when web layout is enabled', async () => {
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
        '[SuperDoc] Web layout mode requires useLayoutEngine: false. Automatically disabling layout engine.',
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

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout mode requires'));
      expect(instance.config.useLayoutEngine).toBe(false);
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

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout mode requires'));
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
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Web layout mode requires'));
      expect(instance.config.useLayoutEngine).toBe(true);
      warnSpy.mockRestore();
    });
  });
});
