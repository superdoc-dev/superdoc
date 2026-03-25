import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shallowRef, reactive } from 'vue';
import { DOCX, PDF } from '@superdoc/common';

// ---------------------------------------------------------------------------
// Module mocks — must be defined before any import that uses them
// ---------------------------------------------------------------------------

vi.mock('@superdoc/common/collaboration/awareness', () => ({
  shuffleArray: vi.fn((arr) => [...arr].reverse()),
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'uuid-test') }));

const seedEditorStateToYDocMock = vi.fn();
const onCollaborationProviderSyncedMock = vi.fn((_, cb) => {
  cb();
  return () => {};
});

class MockToolbar {
  constructor() {
    this.activeEditor = null;
  }
  on() {}
  once() {}
  updateToolbarState() {}
  setActiveEditor(editor) {
    this.activeEditor = editor;
  }
  setZoom() {}
}

vi.mock('@superdoc/super-editor', () => ({
  SuperToolbar: MockToolbar,
  createZip: vi.fn(),
  seedEditorStateToYDoc: seedEditorStateToYDocMock,
  onCollaborationProviderSynced: onCollaborationProviderSyncedMock,
}));

const initCollaborationCommentsMock = vi.fn();

vi.mock('./collaboration/helpers.js', () => ({
  initSuperdocYdoc: vi.fn(() => ({
    ydoc: { destroy: vi.fn() },
    provider: { disconnect: vi.fn(), destroy: vi.fn(), on: vi.fn(), off: vi.fn() },
  })),
  initCollaborationComments: initCollaborationCommentsMock,
  makeDocumentsCollaborative: vi.fn((sd) => sd.config.documents),
}));

const awarenessCleanupSpy = vi.fn();
const setupAwarenessHandlerMock = vi.fn(() => awarenessCleanupSpy);
vi.mock('./collaboration/collaboration.js', () => ({
  setupAwarenessHandler: setupAwarenessHandlerMock,
}));

const overwriteRoomCommentsMock = vi.fn();
const overwriteRoomLockStateMock = vi.fn();

vi.mock('./collaboration/room-overwrite.js', () => ({
  overwriteRoomComments: overwriteRoomCommentsMock,
  overwriteRoomLockState: overwriteRoomLockStateMock,
}));

vi.mock('../components/CommentsLayer/commentsList/super-comments-list.js', () => ({
  SuperComments: vi.fn(),
}));

vi.mock('./helpers/export.js', () => ({
  createDownload: vi.fn(),
  cleanName: vi.fn((v) => v),
}));

vi.mock('./helpers/file.js', () => ({
  normalizeDocumentEntry: vi.fn((d) => d),
}));

vi.mock('./collaboration/permissions.js', () => ({
  isAllowed: vi.fn(() => true),
}));

vi.mock('./whiteboard/Whiteboard', () => ({
  Whiteboard: vi.fn(() => ({})),
}));
vi.mock('./whiteboard/WhiteboardRenderer', () => ({
  WhiteboardRenderer: vi.fn(),
}));

vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProviderWebsocket: vi.fn(),
}));

const createVueAppMock = vi.fn();
vi.mock('./create-app.js', () => ({ createSuperdocVueApp: createVueAppMock }));

function createMockEditor() {
  const docJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'user edits' }] }] };
  return {
    state: {
      doc: {
        attrs: { bodySectPr: {} },
        type: { name: 'doc' },
        content: [],
        nodeSize: 2,
        childCount: 0,
        forEach: vi.fn(),
      },
    },
    options: { mediaFiles: {}, fonts: {} },
    converter: { convertedXml: {} },
    getJSON: vi.fn(() => docJson),
  };
}

function createMockProvider({ synced = true } = {}) {
  return {
    synced,
    awareness: { setLocalStateField: vi.fn(), on: vi.fn(), getStates: vi.fn(() => new Map()) },
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
  };
}

function createMockYDoc() {
  return {
    clientID: 42,
    getXmlFragment: vi.fn(() => ({ length: 0, delete: vi.fn() })),
    getMap: vi.fn(() => ({
      set: vi.fn(),
      get: vi.fn(),
      has: vi.fn(() => false),
      delete: vi.fn(),
      keys: vi.fn(() => []),
      observe: vi.fn(),
    })),
    getArray: vi.fn(() => ({
      length: 0,
      push: vi.fn(),
      delete: vi.fn(),
      toJSON: vi.fn(() => []),
      observe: vi.fn(),
    })),
    transact: vi.fn((fn) => fn()),
    destroy: vi.fn(),
  };
}

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function baseConfig(overrides = {}) {
  return {
    modules: { comments: {} },
    colors: [],
    onException: vi.fn(),
    ...overrides,
  };
}

function createUpgradeHarness({ commentsList = [], attachImpl } = {}) {
  const mockEditor = createMockEditor();
  const innerEditor = {
    ...mockEditor,
    options: { ...mockEditor.options, collaborationIsReady: false },
    on: vi.fn(),
    off: vi.fn(),
  };

  const attachCollaborationMock = vi.fn(() => {
    if (attachImpl) {
      return attachImpl(innerEditor);
    }
    innerEditor.options.collaborationIsReady = true;
  });

  const editorInstance = {
    ...mockEditor,
    editor: innerEditor,
    attachCollaboration: attachCollaborationMock,
  };

  const storeDoc = {
    id: 'doc-1',
    type: DOCX,
    getEditor: () => editorInstance,
    getPresentationEditor: () => editorInstance,
    setEditor: vi.fn(),
    // Use real Vue shallowRefs to match use-document.js composable behavior.
    // Wrapping documents in reactive() below simulates Pinia's reactive store,
    // which auto-unwraps shallowRefs on property access through the proxy.
    ydoc: shallowRef(null),
    provider: shallowRef(null),
  };

  const superdocStore = {
    // reactive() simulates Pinia's ref([]) store behavior: items accessed
    // through the reactive array become reactive proxies that auto-unwrap
    // shallowRef properties — the code must use toRaw() to reach .value.
    documents: reactive([storeDoc]),
    init: vi.fn(),
    reset: vi.fn(),
    setExceptionHandler: vi.fn(),
    activeZoom: 100,
  };

  const commentsStore = {
    init: vi.fn(),
    commentsList,
    translateCommentsForExport: vi.fn(() => []),
    handleEditorLocationsUpdate: vi.fn(),
    hasSyncedCollaborationComments: false,
    commentsParentElement: null,
    editorCommentIds: [],
    removePendingComment: vi.fn(),
    setActiveComment: vi.fn(),
  };

  const app = {
    mount: vi.fn((wrapper) => {
      const el = document.createElement('div');
      el.className = 'superdoc';
      wrapper.appendChild(el);
    }),
    unmount: vi.fn(),
    provide: vi.fn(),
    config: { globalProperties: {} },
  };

  createVueAppMock.mockReturnValue({
    app,
    pinia: {},
    superdocStore,
    commentsStore,
    highContrastModeStore: {},
  });

  return {
    app,
    superdocStore,
    commentsStore,
    mockEditor,
    innerEditor,
    editorInstance,
    attachCollaborationMock,
    storeDoc,
  };
}

let consoleDebugSpy;
let consoleLogSpy;
let consoleWarnSpy;

describe('upgradeToCollaboration', () => {
  let SuperDoc;

  beforeEach(async () => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.resetModules();
    seedEditorStateToYDocMock.mockClear();
    onCollaborationProviderSyncedMock.mockClear().mockImplementation((_, cb) => {
      cb();
      return () => {};
    });
    overwriteRoomCommentsMock.mockClear();
    overwriteRoomLockStateMock.mockClear();
    initCollaborationCommentsMock.mockClear();
    awarenessCleanupSpy.mockClear();
    setupAwarenessHandlerMock.mockClear().mockReturnValue(awarenessCleanupSpy);

    document.body.innerHTML = '<div id="host"></div>';
    ({ SuperDoc } = await import('./SuperDoc.js'));
  });

  afterEach(() => {
    consoleDebugSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('upgrades a local instance into collaboration mode without unmounting the app', async () => {
    const { app, editorInstance, attachCollaborationMock } = createUpgradeHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const ydoc = createMockYDoc();
    const provider = createMockProvider();

    await instance.upgradeToCollaboration({ ydoc, provider });

    expect(instance.isCollaborative).toBe(true);
    expect(app.unmount).not.toHaveBeenCalled();
    expect(seedEditorStateToYDocMock).toHaveBeenCalledWith(editorInstance, ydoc);
    expect(attachCollaborationMock).toHaveBeenCalledWith({ ydoc, collaborationProvider: provider });
  });

  it('waits for provider sync before seeding', async () => {
    createUpgradeHarness();
    let syncCallback;
    onCollaborationProviderSyncedMock.mockImplementation((_, cb) => {
      syncCallback = cb;
      return () => {};
    });

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider({ synced: false }),
    });

    expect(seedEditorStateToYDocMock).not.toHaveBeenCalled();

    syncCallback();
    await upgradePromise;

    expect(seedEditorStateToYDocMock).toHaveBeenCalledTimes(1);
  });

  it('preserves document ids and transfers lock state during upgrade', async () => {
    const { storeDoc } = createUpgradeHarness();
    storeDoc.id = 'my-doc-id';

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'my-doc-id', type: DOCX, data: new Blob() }],
      ...baseConfig({ isLocked: true, lockedBy: { name: 'Alice' } }),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const ydoc = createMockYDoc();
    await instance.upgradeToCollaboration({ ydoc, provider: createMockProvider() });

    expect(instance.config.documents[0].id).toBe('my-doc-id');
    expect(overwriteRoomLockStateMock).toHaveBeenCalledWith(ydoc, {
      isLocked: true,
      lockedBy: { name: 'Alice' },
    });
  });

  it('updates store documents with ydoc/provider and wires collaboration comments', async () => {
    const { storeDoc } = createUpgradeHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const ydoc = createMockYDoc();
    const provider = createMockProvider();

    await instance.upgradeToCollaboration({ ydoc, provider });

    expect(storeDoc.ydoc.value).toBe(ydoc);
    expect(storeDoc.provider.value).toBe(provider);
    expect(initCollaborationCommentsMock).toHaveBeenCalledWith(instance);
  });

  it('rolls back if attachCollaboration throws', async () => {
    const { attachCollaborationMock, storeDoc } = createUpgradeHarness();
    attachCollaborationMock.mockImplementation(() => {
      throw new Error('Attach failed');
    });

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    await expect(
      instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      }),
    ).rejects.toThrow('Attach failed');

    expect(instance.isCollaborative).toBe(false);
    expect(awarenessCleanupSpy).toHaveBeenCalled();
    expect(storeDoc.ydoc.value).toBeNull();
    expect(storeDoc.provider.value).toBeNull();
  });

  it('does not create a DOM snapshot overlay', async () => {
    createUpgradeHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    expect(document.getElementById('host').querySelector('.sd-upgrade-overlay')).toBeNull();
  });

  it('throws when instance is already collaborative', async () => {
    createUpgradeHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig({
        modules: {
          comments: {},
          collaboration: { ydoc: createMockYDoc(), provider: createMockProvider() },
        },
      }),
    });
    await flushMicrotasks();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('already collaborative');
  });

  it('throws when ydoc or provider is missing', async () => {
    createUpgradeHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();

    await expect(instance.upgradeToCollaboration({ ydoc: null, provider: createMockProvider() })).rejects.toThrow(
      'requires both ydoc and provider',
    );
    await expect(instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: null })).rejects.toThrow(
      'requires both ydoc and provider',
    );
  });

  it('throws for unsupported document sets', async () => {
    createUpgradeHarness();

    const multiDocx = new SuperDoc({
      selector: '#host',
      documents: [
        { id: 'doc-1', type: DOCX, data: new Blob() },
        { id: 'doc-2', type: DOCX, data: new Blob() },
      ],
      ...baseConfig(),
    });
    await flushMicrotasks();

    await expect(
      multiDocx.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('single DOCX');

    createUpgradeHarness();
    const mixedDocs = new SuperDoc({
      selector: '#host',
      documents: [
        { id: 'doc-1', type: DOCX, data: new Blob() },
        { id: 'pdf-1', type: PDF, data: new Blob() },
      ],
      ...baseConfig(),
    });
    await flushMicrotasks();

    await expect(
      mixedDocs.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('single-DOCX');
  });

  it('throws when the source editor is not ready or the instance is destroyed', async () => {
    const harness = createUpgradeHarness();
    harness.storeDoc.getPresentationEditor = () => null;
    harness.storeDoc.getEditor = () => null;

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('source editor not yet created');

    createUpgradeHarness();
    const destroyedInstance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    destroyedInstance.destroy();

    await expect(
      destroyedInstance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('destroyed');
  });

  it('prevents concurrent upgrades', async () => {
    createUpgradeHarness();
    let syncResolve;
    onCollaborationProviderSyncedMock.mockImplementation((_, cb) => {
      syncResolve = cb;
      return () => {};
    });

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const first = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider({ synced: false }),
    });

    await expect(
      instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      }),
    ).rejects.toThrow('already in progress');

    syncResolve();
    await first;
  });

  it('rejects immediately and cleans up the sync listener when destroyed during provider sync wait', async () => {
    createUpgradeHarness();
    const syncCleanupSpy = vi.fn();
    onCollaborationProviderSyncedMock.mockImplementation(() => syncCleanupSpy);

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider({ synced: false }),
    });

    instance.destroy();

    await expect(upgradePromise).rejects.toThrow('destroyed during upgrade');
    expect(syncCleanupSpy).toHaveBeenCalled();
    expect(seedEditorStateToYDocMock).not.toHaveBeenCalled();
  });

  it('resolves successfully even when collaborationReady times out', async () => {
    vi.useFakeTimers();
    try {
      const harness = createUpgradeHarness({ attachImpl: () => {} });
      harness.innerEditor.options.collaborationIsReady = false;

      const instance = new SuperDoc({
        selector: '#host',
        documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
        ...baseConfig(),
      });
      await vi.advanceTimersByTimeAsync(0);
      instance.readyEditors = 1;

      const upgradePromise = instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      });

      await vi.advanceTimersByTimeAsync(10_001);
      await upgradePromise;

      expect(instance.isCollaborative).toBe(true);
      expect(initCollaborationCommentsMock).toHaveBeenCalledWith(instance);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves immediately when destroy() is called during readiness wait without reinitializing comments', async () => {
    const harness = createUpgradeHarness({ attachImpl: () => {} });
    harness.innerEditor.options.collaborationIsReady = false;

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      ...baseConfig(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    await flushMicrotasks();
    instance.destroy();
    await upgradePromise;

    expect(initCollaborationCommentsMock).not.toHaveBeenCalled();
  });
});
