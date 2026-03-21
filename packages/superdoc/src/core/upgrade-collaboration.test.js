import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOCX, PDF } from '@superdoc/common';

// ---------------------------------------------------------------------------
// Module mocks — must be defined before any import that uses them
// ---------------------------------------------------------------------------

vi.mock('@superdoc/common/collaboration/awareness', () => ({
  shuffleArray: vi.fn((arr) => [...arr].reverse()),
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'uuid-test') }));

// --- super-editor ---

const seedEditorStateToYDocMock = vi.fn();
const onCollaborationProviderSyncedMock = vi.fn((provider, cb) => {
  // Immediately report synced by default (tests can override)
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

// --- collaboration helpers ---

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

// --- room overwrite ---

const overwriteRoomCommentsMock = vi.fn();
const overwriteRoomLockStateMock = vi.fn();

vi.mock('./collaboration/room-overwrite.js', () => ({
  overwriteRoomComments: overwriteRoomCommentsMock,
  overwriteRoomLockState: overwriteRoomLockStateMock,
}));

// --- other mocks ---

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

// --- Vue app harness ---

const createVueAppMock = vi.fn();
vi.mock('./create-app.js', () => ({ createSuperdocVueApp: createVueAppMock }));

function createAppHarness({ commentsList = [] } = {}) {
  const mockEditor = createMockEditor();

  const superdocStore = {
    documents: [
      {
        id: 'doc-1',
        type: DOCX,
        getEditor: () => mockEditor,
        setEditor: vi.fn(),
      },
    ],
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
    mount: vi.fn(),
    unmount: vi.fn(),
    config: { globalProperties: {} },
  };

  createVueAppMock.mockReturnValue({
    app,
    pinia: {},
    superdocStore,
    commentsStore,
    highContrastModeStore: {},
  });

  return { app, superdocStore, commentsStore, mockEditor };
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Mount mock that creates a `.superdoc` element (simulating Vue render)
 * and fires the upgrade visual-ready callback (or falls back to the `ready`
 * event for non-upgrade mounts like initial construction).
 */
function makeUpgradeAwareMountMock(instance) {
  return (wrapper) => {
    const el = document.createElement('div');
    el.className = 'superdoc';
    wrapper.appendChild(el);

    setTimeout(() => {
      if (instance._upgradeVisualReadyCallback) {
        instance._upgradeVisualReadyCallback();
      } else {
        instance.emit('ready', { superdoc: instance });
      }
    }, 0);
  };
}

/**
 * Ensure the initial mount creates a `.superdoc` element so the snapshot
 * code has something to clone during upgrade-transition tests.
 */
function makeInitialMountMock() {
  return (wrapper) => {
    const el = document.createElement('div');
    el.className = 'superdoc';
    el.innerHTML = '<p>Initial content</p>';
    wrapper.appendChild(el);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('upgrades a local instance into collaboration mode', async () => {
    const { app, superdocStore, mockEditor } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const ydoc = createMockYDoc();
    const provider = createMockProvider();

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    await instance.upgradeToCollaboration({ ydoc, provider });

    expect(instance.isCollaborative).toBe(true);
    expect(seedEditorStateToYDocMock).toHaveBeenCalledWith(mockEditor, ydoc);
    expect(overwriteRoomCommentsMock).toHaveBeenCalledWith(ydoc, expect.anything());
    expect(overwriteRoomLockStateMock).toHaveBeenCalledWith(ydoc, {
      isLocked: false,
      lockedBy: null,
    });
  });

  it('waits for provider sync before seeding', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    let syncCallback;
    onCollaborationProviderSyncedMock.mockImplementation((_, cb) => {
      syncCallback = cb;
      return () => {};
    });

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    const ydoc = createMockYDoc();
    const provider = createMockProvider({ synced: false });

    const upgradePromise = instance.upgradeToCollaboration({ ydoc, provider });

    // Seed should NOT have been called yet (provider not synced)
    expect(seedEditorStateToYDocMock).not.toHaveBeenCalled();

    // Now report synced
    syncCallback();
    await upgradePromise;

    expect(seedEditorStateToYDocMock).toHaveBeenCalled();
  });

  it('preserves document ids across upgrade', async () => {
    const { app, superdocStore } = createAppHarness();
    superdocStore.documents[0].id = 'my-doc-id';

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'my-doc-id', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    expect(instance.config.documents[0].id).toBe('my-doc-id');
  });

  it('transfers lock state during upgrade', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      isLocked: true,
      lockedBy: { name: 'Alice' },
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    const ydoc = createMockYDoc();
    await instance.upgradeToCollaboration({ ydoc, provider: createMockProvider() });

    expect(overwriteRoomLockStateMock).toHaveBeenCalledWith(ydoc, {
      isLocked: true,
      lockedBy: { name: 'Alice' },
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  it('throws when instance is already collaborative', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: {
        comments: {},
        collaboration: { ydoc: createMockYDoc(), provider: createMockProvider() },
      },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('already collaborative');
  });

  it('throws when ydoc is missing', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(instance.upgradeToCollaboration({ ydoc: null, provider: createMockProvider() })).rejects.toThrow(
      'requires both ydoc and provider',
    );
  });

  it('throws when provider is missing', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: null })).rejects.toThrow(
      'requires both ydoc and provider',
    );
  });

  it('throws for multi-DOCX instances', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [
        { id: 'doc-1', type: DOCX, data: new Blob() },
        { id: 'doc-2', type: DOCX, data: new Blob() },
      ],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('single DOCX');
  });

  it('throws for instances with non-DOCX documents', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [
        { id: 'doc-1', type: DOCX, data: new Blob() },
        { id: 'pdf-1', type: PDF, data: new Blob() },
      ],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('single-DOCX');
  });

  it('throws when editor is not ready', async () => {
    const harness = createAppHarness();
    // Override getEditor to return null (editor not created yet)
    harness.superdocStore.documents[0].getEditor = () => null;

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('source editor not yet created');
  });

  it('throws when instance is destroyed', async () => {
    createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();

    instance.destroy();

    await expect(
      instance.upgradeToCollaboration({ ydoc: createMockYDoc(), provider: createMockProvider() }),
    ).rejects.toThrow('destroyed');
  });

  it('prevents concurrent upgrades', async () => {
    const { app } = createAppHarness();

    let syncResolve;
    onCollaborationProviderSyncedMock.mockImplementation((_, cb) => {
      syncResolve = cb;
      return () => {};
    });

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

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

  it('rejects immediately if destroyed during provider sync wait', async () => {
    createAppHarness();

    // Hold the sync callback — never call it; destroy should abort the wait
    onCollaborationProviderSyncedMock.mockImplementation(() => {
      return () => {}; // cleanup
    });

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider({ synced: false }),
    });

    // Destroy while waiting for sync — should abort the wait immediately
    instance.destroy();

    await expect(upgradePromise).rejects.toThrow('destroyed during upgrade');

    // Seeding should NOT have happened
    expect(seedEditorStateToYDocMock).not.toHaveBeenCalled();
  });

  it('cleans up sync listener when destroyed during sync wait', async () => {
    createAppHarness();

    const syncCleanupSpy = vi.fn();
    onCollaborationProviderSyncedMock.mockImplementation(() => {
      return syncCleanupSpy;
    });

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider({ synced: false }),
    });

    // Destroy aborts immediately and cleans up the sync listener
    instance.destroy();

    await expect(upgradePromise).rejects.toThrow('destroyed during upgrade');
    expect(syncCleanupSpy).toHaveBeenCalled();
  });

  it('rejects if destroyed during collaborative remount wait', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    // Do NOT call visual-ready callback — simulate a runtime that hasn't
    // finished initializing when destroy() is called.
    app.mount.mockImplementation((wrapper) => {
      const el = document.createElement('div');
      el.className = 'superdoc';
      wrapper.appendChild(el);
    });

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    await flushMicrotasks();
    instance.destroy();

    await expect(upgradePromise).rejects.toThrow('destroyed during upgrade');
    expect(instance.isCollaborative).toBe(true); // detach was skipped
  });

  // -----------------------------------------------------------------------
  // Runtime teardown / remount
  // -----------------------------------------------------------------------

  it('does not call removeAllListeners during upgrade', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const removeAllSpy = vi.spyOn(instance, 'removeAllListeners');

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    expect(removeAllSpy).not.toHaveBeenCalled();
  });

  it('resets readyEditors to 0 during remount', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    let readyEditorsAtMount;
    app.mount.mockImplementation((wrapper) => {
      readyEditorsAtMount = instance.readyEditors;
      const el = document.createElement('div');
      el.className = 'superdoc';
      wrapper.appendChild(el);
      setTimeout(() => {
        if (instance._upgradeVisualReadyCallback) {
          instance._upgradeVisualReadyCallback();
        }
      }, 0);
    });

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    expect(readyEditorsAtMount).toBe(0);
  });

  it('unmounts and remounts the Vue app', async () => {
    const { app } = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    expect(app.unmount).toHaveBeenCalled();
    expect(createVueAppMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('triggers rollback preserving local state, awareness cleanup, and comments list when remount fails', async () => {
    const harness = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    instance.commentsList = { close: vi.fn() };
    const addCommentsListSpy = vi.spyOn(instance, 'addCommentsList').mockImplementation(() => {});

    let jsonOverrideDuringRollback;
    let callCount = 0;
    const successResult = () => ({
      app: {
        mount: vi.fn((wrapper) => {
          const el = document.createElement('div');
          el.className = 'superdoc';
          wrapper.appendChild(el);
          setTimeout(() => {
            if (instance._upgradeVisualReadyCallback) {
              instance._upgradeVisualReadyCallback();
            }
          }, 0);
        }),
        unmount: vi.fn(),
        config: { globalProperties: {} },
      },
      pinia: {},
      superdocStore: harness.superdocStore,
      commentsStore: harness.commentsStore,
      highContrastModeStore: {},
    });
    createVueAppMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated remount failure');
      }
      jsonOverrideDuringRollback = instance.config.jsonOverride;
      return successResult();
    });

    let caughtError;
    try {
      await instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError?.message).toBe('Simulated remount failure');
    expect(awarenessCleanupSpy).toHaveBeenCalled();
    expect(instance.isCollaborative).toBe(false);
    expect(addCommentsListSpy).toHaveBeenCalled();
    expect(jsonOverrideDuringRollback).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'user edits' }] }],
    });
    expect(instance.config.jsonOverride).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Upgrade transition (snapshot overlay)
  // -----------------------------------------------------------------------

  it('creates a snapshot overlay before teardown and removes it after visual-ready', async () => {
    const { app } = createAppHarness();
    app.mount.mockImplementation(makeInitialMountMock());

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const host = document.getElementById('host');

    // Override mount for the upgrade remount
    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    // Overlay should have been removed after success
    expect(host.querySelector('.sd-upgrade-overlay')).toBeNull();
    // New .superdoc should not have the hidden class
    const newSuperdoc = host.querySelector('.superdoc');
    expect(newSuperdoc?.classList.contains('sd-upgrade-hidden')).toBe(false);
  });

  it('pins container geometry during transition and restores it after', async () => {
    const { app } = createAppHarness();
    app.mount.mockImplementation(makeInitialMountMock());

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const host = document.getElementById('host');
    const originalMinHeight = host.style.minHeight;

    let minHeightDuringMount;
    app.mount.mockImplementation((wrapper) => {
      minHeightDuringMount = host.style.minHeight;
      const el = document.createElement('div');
      el.className = 'superdoc';
      wrapper.appendChild(el);
      setTimeout(() => {
        if (instance._upgradeVisualReadyCallback) {
          instance._upgradeVisualReadyCallback();
        }
      }, 0);
    });

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    // Min-height should have been set during transition (pinned)
    expect(minHeightDuringMount).toBeTruthy();
    // Min-height should be restored after reveal
    expect(host.style.minHeight).toBe(originalMinHeight);
  });

  it('cleans up overlay when destroy is called during the upgrade transition', async () => {
    const { app } = createAppHarness();
    app.mount.mockImplementation(makeInitialMountMock());

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const host = document.getElementById('host');

    // Don't call visual-ready callback — leave the upgrade transition in progress
    app.mount.mockImplementation((wrapper) => {
      const el = document.createElement('div');
      el.className = 'superdoc';
      wrapper.appendChild(el);
    });

    const upgradePromise = instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });
    await flushMicrotasks();

    // Overlay should exist while the upgrade transition is in progress
    expect(host.querySelector('.sd-upgrade-overlay')).not.toBeNull();

    instance.destroy();
    await expect(upgradePromise).rejects.toThrow('destroyed');

    // Overlay should be cleaned up
    expect(host.querySelector('.sd-upgrade-overlay')).toBeNull();
    expect(instance._upgradeVisualReadyCallback).toBeNull();
  });

  it('degrades gracefully when no .superdoc element exists for snapshot', async () => {
    const { app } = createAppHarness();
    // Initial mount does NOT create a .superdoc element
    app.mount.mockImplementation(() => {});

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    // Upgrade mount: create .superdoc and fire callback
    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    // Should complete without error even though snapshot was null
    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    expect(instance.isCollaborative).toBe(true);
  });

  it('waits for visual-ready callback, not the ready event', async () => {
    const { app } = createAppHarness();
    app.mount.mockImplementation(makeInitialMountMock());

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    let visualReadyCallbackCalled = false;

    // Mount creates a .superdoc but does NOT call the visual-ready callback.
    // Instead, it emits the 'ready' event (old path). The upgrade should
    // NOT resolve from 'ready' alone.
    app.mount.mockImplementation((wrapper) => {
      const el = document.createElement('div');
      el.className = 'superdoc';
      wrapper.appendChild(el);
      setTimeout(() => {
        instance.emit('ready', { superdoc: instance });
        // Then after a further tick, call the visual-ready callback
        setTimeout(() => {
          visualReadyCallbackCalled = true;
          if (instance._upgradeVisualReadyCallback) {
            instance._upgradeVisualReadyCallback();
          }
        }, 0);
      }, 0);
    });

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    // The upgrade should have waited for the visual-ready callback
    expect(visualReadyCallbackCalled).toBe(true);
  });

  it('sets _upgradeVisualReadyCallback only during upgrade', async () => {
    const { app } = createAppHarness();
    app.mount.mockImplementation(makeInitialMountMock());

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    // Before upgrade: no callback
    expect(instance._upgradeVisualReadyCallback).toBeFalsy();

    app.mount.mockImplementation(makeUpgradeAwareMountMock(instance));

    await instance.upgradeToCollaboration({
      ydoc: createMockYDoc(),
      provider: createMockProvider(),
    });

    // After upgrade: callback cleared
    expect(instance._upgradeVisualReadyCallback).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Rollback regression: leaked runtime (Fix 1)
  // -----------------------------------------------------------------------

  it('stops the failed collaborative runtime before starting rollback (mount throws)', async () => {
    const harness = createAppHarness();
    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    const collabUnmount = vi.fn();
    let callCount = 0;

    createVueAppMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Collaborative runtime: app created but mount throws
        return {
          app: {
            mount: vi.fn(() => {
              throw new Error('Collaborative mount failed');
            }),
            unmount: collabUnmount,
            config: { globalProperties: {} },
          },
          pinia: {},
          superdocStore: harness.superdocStore,
          commentsStore: harness.commentsStore,
          highContrastModeStore: {},
        };
      }
      // Rollback runtime: succeeds
      return {
        app: {
          mount: vi.fn((wrapper) => {
            const el = document.createElement('div');
            el.className = 'superdoc';
            wrapper.appendChild(el);
            setTimeout(() => {
              if (instance._upgradeVisualReadyCallback) {
                instance._upgradeVisualReadyCallback();
              }
            }, 0);
          }),
          unmount: vi.fn(),
          config: { globalProperties: {} },
        },
        pinia: {},
        superdocStore: harness.superdocStore,
        commentsStore: harness.commentsStore,
        highContrastModeStore: {},
      };
    });

    await expect(
      instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      }),
    ).rejects.toThrow('Collaborative mount failed');

    // The collaborative app must be unmounted via #stopRuntime() before rollback
    expect(collabUnmount).toHaveBeenCalled();
  });

  it('stops a timed-out collaborative runtime before starting rollback', async () => {
    vi.useFakeTimers();
    try {
      const harness = createAppHarness();
      const instance = new SuperDoc({
        selector: '#host',
        documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
        modules: { comments: {} },
        colors: [],
        onException: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(0);
      instance.readyEditors = 1;

      const collabUnmount = vi.fn();
      let callCount = 0;

      createVueAppMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Collaborative runtime: mounts but never fires visual-ready
          return {
            app: {
              mount: vi.fn((wrapper) => {
                const el = document.createElement('div');
                el.className = 'superdoc';
                wrapper.appendChild(el);
                // visual-ready callback deliberately NOT called
              }),
              unmount: collabUnmount,
              config: { globalProperties: {} },
            },
            pinia: {},
            superdocStore: harness.superdocStore,
            commentsStore: harness.commentsStore,
            highContrastModeStore: {},
          };
        }
        // Rollback runtime: fires visual-ready immediately
        return {
          app: {
            mount: vi.fn((wrapper) => {
              const el = document.createElement('div');
              el.className = 'superdoc';
              wrapper.appendChild(el);
              // Fire visual-ready synchronously to avoid timer complications
              if (instance._upgradeVisualReadyCallback) {
                instance._upgradeVisualReadyCallback();
              }
            }),
            unmount: vi.fn(),
            config: { globalProperties: {} },
          },
          pinia: {},
          superdocStore: harness.superdocStore,
          commentsStore: harness.commentsStore,
          highContrastModeStore: {},
        };
      });

      const upgradePromise = instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      });

      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const resultPromise = expect(upgradePromise).rejects.toThrow('visually ready within 30 s');

      // Advance past the 30s collaborative timeout
      await vi.advanceTimersByTimeAsync(30_001);

      await resultPromise;

      // The timed-out collaborative app must be unmounted before rollback
      expect(collabUnmount).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // -----------------------------------------------------------------------
  // Rollback regression: incomplete state restoration (Fix 2)
  // -----------------------------------------------------------------------

  it('restores convertedXml and mediaFiles on the rollback editor', async () => {
    const harness = createAppHarness();

    // Simulate pre-upgrade edits that modified parts and media
    harness.mockEditor.converter.convertedXml = {
      'word/styles.xml': { tag: 'w:styles', children: [{ tag: 'w:style', attrs: { id: 'custom' } }] },
      'word/numbering.xml': { tag: 'w:numbering', children: [{ tag: 'w:abstractNum' }] },
    };
    harness.mockEditor.options.mediaFiles = {
      'word/media/image1.png': 'base64-data-here',
    };

    const instance = new SuperDoc({
      selector: '#host',
      documents: [{ id: 'doc-1', type: DOCX, data: new Blob() }],
      modules: { comments: {} },
      colors: [],
      onException: vi.fn(),
    });
    await flushMicrotasks();
    instance.readyEditors = 1;

    // The rollback editor starts with empty/reimported state
    const rollbackEditor = {
      converter: { convertedXml: {} },
      options: { mediaFiles: {}, fonts: {} },
      state: harness.mockEditor.state,
      getJSON: harness.mockEditor.getJSON,
    };

    let callCount = 0;
    createVueAppMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Collaborative: fails during createSuperdocVueApp
        throw new Error('Simulated collab failure');
      }
      // Rollback: succeeds, returns a store with the rollback editor
      return {
        app: {
          mount: vi.fn((wrapper) => {
            const el = document.createElement('div');
            el.className = 'superdoc';
            wrapper.appendChild(el);
            setTimeout(() => {
              if (instance._upgradeVisualReadyCallback) {
                instance._upgradeVisualReadyCallback();
              }
            }, 0);
          }),
          unmount: vi.fn(),
          config: { globalProperties: {} },
        },
        pinia: {},
        superdocStore: {
          documents: [
            {
              id: 'doc-1',
              type: DOCX,
              getEditor: () => rollbackEditor,
              setEditor: vi.fn(),
            },
          ],
          init: vi.fn(),
          reset: vi.fn(),
          setExceptionHandler: vi.fn(),
          activeZoom: 100,
        },
        commentsStore: harness.commentsStore,
        highContrastModeStore: {},
      };
    });

    await expect(
      instance.upgradeToCollaboration({
        ydoc: createMockYDoc(),
        provider: createMockProvider(),
      }),
    ).rejects.toThrow('Simulated collab failure');

    // The rollback editor should have the pre-upgrade parts and media restored
    expect(rollbackEditor.converter.convertedXml).toEqual({
      'word/styles.xml': { tag: 'w:styles', children: [{ tag: 'w:style', attrs: { id: 'custom' } }] },
      'word/numbering.xml': { tag: 'w:numbering', children: [{ tag: 'w:abstractNum' }] },
    });
    expect(rollbackEditor.options.mediaFiles).toEqual({
      'word/media/image1.png': 'base64-data-here',
    });
  });
});
