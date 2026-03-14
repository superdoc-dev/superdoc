import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock binding object - we'll configure this in tests
const mockBinding = {
  initView: vi.fn(),
  _forceRerender: vi.fn(),
  mux: vi.fn((fn) => fn()),
  _prosemirrorChanged: vi.fn(),
};

vi.mock('y-prosemirror', () => {
  const mockSyncPluginKey = {
    getState: vi.fn(() => ({ binding: mockBinding })),
  };
  const mockUndoPluginKey = {
    getState: vi.fn(() => null),
  };
  return {
    ySyncPlugin: vi.fn(() => 'y-sync-plugin'),
    ySyncPluginKey: mockSyncPluginKey,
    yUndoPluginKey: mockUndoPluginKey,
    prosemirrorToYDoc: vi.fn(),
  };
});

vi.mock('yjs', () => ({
  encodeStateAsUpdate: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

import * as YProsemirror from 'y-prosemirror';
import * as Yjs from 'yjs';

import * as CollaborationModule from './collaboration.js';

const { Collaboration, CollaborationPluginKey, createSyncPlugin, initializeMetaMap, generateCollaborationData } =
  CollaborationModule;

const createYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  const observers = new Set();
  return {
    set: vi.fn((key, value) => {
      store.set(key, value);
    }),
    get: vi.fn((key) => store.get(key)),
    observe: vi.fn((fn) => {
      observers.add(fn);
    }),
    unobserve: vi.fn((fn) => {
      observers.delete(fn);
    }),
    _trigger(keys) {
      observers.forEach((observer) => observer({ changes: { keys } }));
    },
    store,
  };
};

const createYDocStub = ({ docxValue, hasDocx = true } = {}) => {
  const initialMetaEntries = hasDocx ? { docx: docxValue ?? [] } : {};
  const metas = createYMap(initialMetaEntries);
  if (!hasDocx) metas.store.delete('docx');
  const media = createYMap();
  const listeners = {};
  return {
    getXmlFragment: vi.fn(() => ({ fragment: true })),
    getMap: vi.fn((name) => {
      if (name === 'meta') return metas;
      return media;
    }),
    on: vi.fn((event, handler) => {
      listeners[event] = handler;
    }),
    transact: vi.fn((fn, meta) => fn(meta)),
    _maps: { metas, media },
    _listeners: listeners,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collaboration extension', () => {
  it('skips plugin registration when no ydoc present', () => {
    const result = Collaboration.config.addPmPlugins.call({ editor: { options: {} } });
    expect(result).toEqual([]);
  });

  it('configures sync plugin and listeners when ydoc exists', () => {
    const ydoc = createYDocStub();
    const editorState = { doc: {} };
    const provider = { synced: false, on: vi.fn(), off: vi.fn() };
    const editor = {
      options: {
        isHeadless: false,
        ydoc,
        collaborationProvider: provider,
      },
      storage: { image: { media: {} } },
      emit: vi.fn(),
      view: { state: editorState, dispatch: vi.fn() },
    };

    const context = { editor, options: {} };

    const [plugin] = Collaboration.config.addPmPlugins.call(context);

    expect(plugin).toBe('y-sync-plugin');
    expect(YProsemirror.ySyncPlugin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onFirstRender: expect.any(Function) }),
    );
    expect(provider.on).toHaveBeenCalledWith('synced', expect.any(Function));
    expect(provider.on).toHaveBeenCalledWith('sync', expect.any(Function));

    const mediaObserver = ydoc._maps.media.observe.mock.calls[0][0];
    ydoc._maps.media.get.mockReturnValue({ blob: true });
    mediaObserver({ changes: { keys: new Map([['word/media/image.png', {}]]) } });
    expect(editor.storage.image.media['word/media/image.png']).toEqual({ blob: true });
  });

  it('emits collaborationReady on sync(true) when provider does not emit synced', () => {
    const ydoc = createYDocStub();
    const provider = { synced: false, on: vi.fn(), off: vi.fn() };
    const editor = {
      options: {
        isHeadless: false,
        ydoc,
        collaborationProvider: provider,
      },
      storage: { image: { media: {} } },
      emit: vi.fn(),
      view: { state: { doc: {} }, dispatch: vi.fn() },
    };

    const context = { editor, options: {} };
    Collaboration.config.addPmPlugins.call(context);

    const syncHandlers = provider.on.mock.calls.filter(([event]) => event === 'sync').map(([, handler]) => handler);
    expect(syncHandlers.length).toBeGreaterThan(0);

    syncHandlers.forEach((handler) => handler(true));

    expect(editor.emit).toHaveBeenCalledWith('collaborationReady', { editor, ydoc });
  });

  it('creates sync plugin fragment via helper', () => {
    const ydoc = createYDocStub();
    const editor = {
      options: {
        isNewFile: true,
        content: { 'word/document.xml': '<doc />' },
        fonts: { font1: 'binary' },
        mediaFiles: { 'word/media/img.png': new Uint8Array([1]) },
      },
    };

    const [plugin, fragment] = createSyncPlugin(ydoc, editor);
    expect(plugin).toBe('y-sync-plugin');
    expect(fragment).toEqual({ fragment: true });

    const { onFirstRender } = YProsemirror.ySyncPlugin.mock.calls[0][1];
    onFirstRender();
    // initializeMetaMap seeds fonts and media into the ydoc maps
    expect(ydoc._maps.metas.set).toHaveBeenCalledWith('fonts', editor.options.fonts);
    expect(ydoc._maps.media.set).toHaveBeenCalledWith('word/media/img.png', new Uint8Array([1]));
  });

  it('initializes meta map with fonts, bootstrap metadata, and media', () => {
    const ydoc = createYDocStub();
    const editor = {
      state: {
        doc: {
          attrs: {
            bodySectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [{ type: 'element', name: 'w:pgSz', attributes: { 'w:orient': 'landscape' } }],
            },
          },
        },
      },
      options: {
        content: { 'word/document.xml': '<doc />' },
        fonts: { 'font1.ttf': new Uint8Array([1]) },
        mediaFiles: { 'word/media/img.png': new Uint8Array([5]) },
      },
    };

    initializeMetaMap(ydoc, editor);

    const metaStore = ydoc._maps.metas.store;
    // initializeMetaMap no longer writes 'docx' — parts are seeded via seedPartsFromEditor
    expect(metaStore.get('fonts')).toEqual(editor.options.fonts);
    expect(metaStore.get('bodySectPr')).toEqual(editor.state.doc.attrs.bodySectPr);
    expect(metaStore.get('bootstrap')).toEqual(expect.objectContaining({ version: 1, source: 'browser' }));
    expect(ydoc._maps.media.set).toHaveBeenCalledWith('word/media/img.png', new Uint8Array([5]));
  });

  it('applies bodySectPr from the meta map when the meta entry changes', () => {
    const ydoc = createYDocStub();
    const provider = { synced: false, on: vi.fn(), off: vi.fn() };
    const bodySectPr = {
      type: 'element',
      name: 'w:sectPr',
      elements: [{ type: 'element', name: 'w:pgSz', attributes: { 'w:orient': 'landscape' } }],
    };
    ydoc._maps.metas.store.set('bodySectPr', bodySectPr);

    const tr = {
      setDocAttribute: vi.fn(() => tr),
      setMeta: vi.fn(() => tr),
    };
    const editor = {
      options: {
        isHeadless: false,
        ydoc,
        collaborationProvider: provider,
      },
      state: {
        doc: {
          attrs: {
            attributes: null,
            bodySectPr: null,
          },
        },
        tr,
      },
      dispatch: vi.fn(),
      storage: { image: { media: {} } },
      emit: vi.fn(),
      view: { state: { doc: {} }, dispatch: vi.fn() },
    };

    const context = { editor, options: {} };
    Collaboration.config.addPmPlugins.call(context);

    ydoc._maps.metas._trigger(new Map([['bodySectPr', {}]]));

    expect(tr.setDocAttribute).toHaveBeenCalledWith('bodySectPr', bodySectPr);
    expect(tr.setMeta).toHaveBeenCalledWith('addToHistory', false);
    expect(tr.setMeta).toHaveBeenCalledWith('bodySectPrSync', true);
    expect(editor.dispatch).toHaveBeenCalledWith(tr);
  });

  it('publishes bodySectPr changes from local transactions into the meta map', () => {
    const ydoc = createYDocStub();
    const provider = { synced: false, on: vi.fn(), off: vi.fn() };
    const bodySectPr = {
      type: 'element',
      name: 'w:sectPr',
      elements: [{ type: 'element', name: 'w:pgSz', attributes: { 'w:orient': 'landscape' } }],
    };
    const editor = {
      options: {
        isHeadless: false,
        ydoc,
        collaborationProvider: provider,
      },
      state: {
        doc: {
          attrs: {
            attributes: null,
            bodySectPr,
          },
        },
      },
      storage: { image: { media: {} } },
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      view: { state: { doc: {} }, dispatch: vi.fn() },
    };

    const context = { editor, options: {} };
    Collaboration.config.addPmPlugins.call(context);

    const bodySectPrTransactionHandler = editor.on.mock.calls.find(([event]) => event === 'transaction')?.[1];
    expect(bodySectPrTransactionHandler).toBeTypeOf('function');

    bodySectPrTransactionHandler({
      transaction: {
        before: {
          attrs: {
            bodySectPr: null,
          },
        },
        getMeta: vi.fn(() => null),
      },
    });

    expect(ydoc._maps.metas.set).toHaveBeenCalledWith('bodySectPr', bodySectPr);
  });

  it('generates collaboration data and encodes ydoc update', async () => {
    const ydoc = createYDocStub();
    const doc = { type: 'doc' };
    YProsemirror.prosemirrorToYDoc.mockReturnValue(ydoc);
    const editor = {
      state: { doc },
      options: {
        content: [{ name: 'word/document.xml', content: '<doc />' }],
        fonts: {},
        mediaFiles: {},
        user: { id: 'user' },
      },
    };

    const data = await generateCollaborationData(editor);

    expect(YProsemirror.prosemirrorToYDoc).toHaveBeenCalledWith(doc, 'supereditor');
    expect(Yjs.encodeStateAsUpdate).toHaveBeenCalledWith(ydoc);
    expect(data).toBeInstanceOf(Uint8Array);
  });

  describe('image persistence in collaboration', () => {
    it('persists images in Y.js media map when addImageToCollaboration is called', () => {
      const ydoc = createYDocStub();
      const editorState = { doc: {} };
      const provider = { synced: true, on: vi.fn(), off: vi.fn() };
      const editor = {
        options: {
          isHeadless: false,
          ydoc,
          collaborationProvider: provider,
        },
        storage: { image: { media: {} } },
        emit: vi.fn(),
        view: { state: editorState, dispatch: vi.fn() },
      };

      const context = { editor, options: {} };
      Collaboration.config.addPmPlugins.call(context);

      // Get the addImageToCollaboration command
      const commands = Collaboration.config.addCommands.call(context);
      const addImageCommand = commands.addImageToCollaboration({
        mediaPath: 'word/media/test-image.png',
        fileData: 'base64-encoded-image-data',
      });

      // Execute the command
      addImageCommand();

      // Verify the image was added to the Y.js media map
      expect(ydoc._maps.media.set).toHaveBeenCalledWith('word/media/test-image.png', 'base64-encoded-image-data');
    });

    it('restores images from Y.js media map on reopening document (simulating close/reopen)', () => {
      // Simulate a document that was closed and reopened
      const ydoc = createYDocStub();

      // Pre-populate the media map with an image (as if it was saved earlier)
      ydoc._maps.media.store.set('word/media/existing-image.png', 'base64-existing-image');
      ydoc._maps.media.get.mockImplementation((key) => ydoc._maps.media.store.get(key));

      const editorState = { doc: {} };
      const provider = { synced: false, on: vi.fn(), off: vi.fn() };
      const editor = {
        options: {
          isHeadless: false,
          ydoc,
          collaborationProvider: provider,
        },
        storage: { image: { media: {} } },
        emit: vi.fn(),
        view: { state: editorState, dispatch: vi.fn() },
      };

      const context = { editor, options: {} };

      // Initialize the collaboration extension (simulating document open)
      Collaboration.config.addPmPlugins.call(context);

      // Trigger the media observer as if the Y.js map synced
      const mediaObserver = ydoc._maps.media.observe.mock.calls[0][0];
      mediaObserver({
        changes: {
          keys: new Map([['word/media/existing-image.png', {}]]),
        },
      });

      // Verify the image was restored to editor storage
      expect(editor.storage.image.media['word/media/existing-image.png']).toBe('base64-existing-image');
    });

    it('syncs images between collaborators (User A uploads, User B receives)', () => {
      const sharedYdoc = createYDocStub();

      // User A's editor
      const editorA = {
        options: {
          isHeadless: false,
          ydoc: sharedYdoc,
          collaborationProvider: { synced: true, on: vi.fn(), off: vi.fn() },
        },
        storage: { image: { media: {} } },
        emit: vi.fn(),
        view: { state: { doc: {} }, dispatch: vi.fn() },
      };

      // User B's editor (same ydoc, simulating real-time collaboration)
      const editorB = {
        options: {
          isHeadless: false,
          ydoc: sharedYdoc,
          collaborationProvider: { synced: true, on: vi.fn(), off: vi.fn() },
        },
        storage: { image: { media: {} } },
        emit: vi.fn(),
        view: { state: { doc: {} }, dispatch: vi.fn() },
      };

      const contextA = { editor: editorA, options: {} };
      const contextB = { editor: editorB, options: {} };

      // Initialize both editors
      Collaboration.config.addPmPlugins.call(contextA);
      Collaboration.config.addPmPlugins.call(contextB);

      // User A uploads an image
      const commandsA = Collaboration.config.addCommands.call(contextA);
      const addImageCommandA = commandsA.addImageToCollaboration({
        mediaPath: 'word/media/user-a-image.png',
        fileData: 'base64-user-a-image',
      });
      addImageCommandA();

      // Verify User A's image is in the shared media map
      expect(sharedYdoc._maps.media.set).toHaveBeenCalledWith('word/media/user-a-image.png', 'base64-user-a-image');

      // Simulate Y.js propagating the change to User B
      sharedYdoc._maps.media.get.mockReturnValue('base64-user-a-image');
      const mediaBObserver = sharedYdoc._maps.media.observe.mock.calls[1][0]; // User B's observer
      mediaBObserver({
        changes: {
          keys: new Map([['word/media/user-a-image.png', {}]]),
        },
      });

      // Verify User B received the image in their editor storage
      expect(editorB.storage.image.media['word/media/user-a-image.png']).toBe('base64-user-a-image');
    });

    it('does not overwrite existing images in editor storage when syncing', () => {
      const ydoc = createYDocStub();

      const editor = {
        options: {
          isHeadless: false,
          ydoc,
          collaborationProvider: { synced: false, on: vi.fn(), off: vi.fn() },
        },
        storage: {
          image: {
            media: {
              'word/media/local-image.png': 'base64-local-version',
            },
          },
        },
        emit: vi.fn(),
        view: { state: { doc: {} }, dispatch: vi.fn() },
      };

      const context = { editor, options: {} };
      Collaboration.config.addPmPlugins.call(context);

      // Simulate Y.js trying to sync the same image
      ydoc._maps.media.get.mockReturnValue('base64-synced-version');
      const mediaObserver = ydoc._maps.media.observe.mock.calls[0][0];
      mediaObserver({
        changes: {
          keys: new Map([['word/media/local-image.png', {}]]),
        },
      });

      // Verify the local version was NOT overwritten (since it already exists)
      expect(editor.storage.image.media['word/media/local-image.png']).toBe('base64-local-version');
    });
  });

  describe('headless mode Y.js sync', () => {
    const createHeadlessEditor = (overrides = {}) => {
      const ydoc = overrides.ydoc ?? createYDocStub();
      const provider = overrides.collaborationProvider ?? { synced: false, on: vi.fn(), off: vi.fn() };
      const editor = {
        options: {
          isHeadless: true,
          ydoc,
          collaborationProvider: provider,
          ...overrides.options,
        },
        state: overrides.state ?? { doc: { type: 'doc' } },
        storage: { image: { media: {} } },
        emit: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        once: vi.fn(),
        dispatch: overrides.dispatch ?? vi.fn(),
      };
      return { editor, ydoc, provider, context: { editor, options: {} } };
    };

    const getTransactionListener = (editor) => editor.on.mock.calls.find((call) => call[0] === 'transaction')?.[1];

    const getDestroyCleanup = (editor) => editor.once.mock.calls.find((call) => call[0] === 'destroy')?.[1];

    beforeEach(() => {
      vi.clearAllMocks();
      mockBinding.initView.mockClear();
      mockBinding._forceRerender.mockClear();
      mockBinding.mux.mockClear();
      mockBinding._prosemirrorChanged.mockClear();
      YProsemirror.ySyncPluginKey.getState.mockReturnValue({ binding: mockBinding });
      YProsemirror.yUndoPluginKey.getState.mockReturnValue(null);
    });

    it('initializes Y.js binding with headless view shim when isHeadless is true', () => {
      const { context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(mockBinding.initView).toHaveBeenCalledTimes(1);
      const shimArg = mockBinding.initView.mock.calls[0][0];
      expect(shimArg).toHaveProperty('state');
      expect(shimArg).toHaveProperty('dispatch');
      expect(shimArg).toHaveProperty('hasFocus');
      expect(shimArg).toHaveProperty('_root');
      expect(shimArg.hasFocus()).toBe(false);
    });

    it('does not initialize headless binding when isHeadless is false', () => {
      const ydoc = createYDocStub();
      const editorState = { doc: {} };
      const provider = { synced: false, on: vi.fn(), off: vi.fn() };
      const editor = {
        options: {
          isHeadless: false,
          ydoc,
          collaborationProvider: provider,
        },
        storage: { image: { media: {} } },
        emit: vi.fn(),
        view: { state: editorState, dispatch: vi.fn() },
      };

      const context = { editor, options: {} };
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(mockBinding.initView).not.toHaveBeenCalled();
    });

    it('registers transaction listener in headless mode', () => {
      const { editor, context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(editor.on).toHaveBeenCalledWith('transaction', expect.any(Function));
    });

    it('forces an initial rerender to hydrate headless state from Y.js', () => {
      const { context } = createHeadlessEditor({ state: { doc: { type: 'doc', content: [] } } });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(mockBinding.initView).toHaveBeenCalledTimes(1);
      expect(mockBinding._forceRerender).toHaveBeenCalledTimes(1);
    });

    it('registers headless PM->Y sync before onCreate lifecycle runs', () => {
      const { editor, context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);

      expect(editor.on).toHaveBeenCalledWith('transaction', expect.any(Function));
    });

    it('syncs PM changes to Y.js via transaction listener', () => {
      const editorState = { doc: { type: 'doc', content: [] } };
      const { editor, context } = createHeadlessEditor({ state: editorState });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const transactionListener = getTransactionListener(editor);
      expect(transactionListener).toBeDefined();

      transactionListener({ transaction: { getMeta: vi.fn().mockReturnValue(null) } });

      expect(mockBinding._prosemirrorChanged).toHaveBeenCalledWith(editorState.doc);
    });

    it('wraps headless PM->Y sync in the binding mutex', () => {
      const editorState = { doc: { type: 'doc', content: [] } };
      const { editor, context } = createHeadlessEditor({ state: editorState });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const transactionListener = getTransactionListener(editor);
      transactionListener({ transaction: { getMeta: vi.fn().mockReturnValue(null) } });

      expect(mockBinding.mux).toHaveBeenCalledTimes(1);
      expect(mockBinding._prosemirrorChanged).toHaveBeenCalledWith(editorState.doc);
    });

    it('propagates addToHistory=false into Y.js transaction meta for headless sync', () => {
      const ydoc = createYDocStub();
      const yjsMetaSet = vi.fn();
      ydoc.transact = vi.fn((fn) => {
        fn({ meta: { set: yjsMetaSet } });
      });

      const editorState = { doc: { type: 'doc', content: [] } };
      const { editor, context } = createHeadlessEditor({ ydoc, state: editorState });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const transactionListener = getTransactionListener(editor);
      transactionListener({
        transaction: {
          getMeta: vi.fn((key) => {
            if (key === 'addToHistory') return false;
            return null;
          }),
        },
      });

      expect(ydoc.transact).toHaveBeenCalledWith(expect.any(Function), YProsemirror.ySyncPluginKey);
      expect(yjsMetaSet).toHaveBeenCalledWith('addToHistory', false);
      expect(mockBinding._prosemirrorChanged).toHaveBeenCalledWith(editorState.doc);
    });

    it('stops undo capture for headless transactions marked addToHistory=false', () => {
      const stopCapturing = vi.fn();
      YProsemirror.yUndoPluginKey.getState.mockReturnValue({
        undoManager: {
          stopCapturing,
        },
      });

      const { editor, context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const transactionListener = getTransactionListener(editor);
      transactionListener({
        transaction: {
          getMeta: vi.fn((key) => {
            if (key === 'addToHistory') return false;
            return null;
          }),
        },
      });

      expect(stopCapturing).toHaveBeenCalledTimes(1);
    });

    it('skips sync for transactions originating from Y.js', () => {
      const { editor, context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const transactionListener = getTransactionListener(editor);
      transactionListener({ transaction: { getMeta: vi.fn().mockReturnValue({ isChangeOrigin: true }) } });

      expect(mockBinding._prosemirrorChanged).not.toHaveBeenCalled();
    });

    it('handles missing binding gracefully', () => {
      YProsemirror.ySyncPluginKey.getState.mockReturnValue(null);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { context } = createHeadlessEditor();

      Collaboration.config.addPmPlugins.call(context);
      expect(() => Collaboration.config.onCreate.call(context)).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('no sync state or binding found'));
      consoleSpy.mockRestore();
    });

    it('headless shim state getter returns current editor state', () => {
      const initialState = { doc: { type: 'doc', content: 'initial' } };
      const updatedState = { doc: { type: 'doc', content: 'updated' } };
      const { editor, context } = createHeadlessEditor({ state: initialState });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const shimArg = mockBinding.initView.mock.calls[0][0];
      expect(shimArg.state).toBe(initialState);

      editor.state = updatedState;
      expect(shimArg.state).toBe(updatedState);
    });

    it('headless shim dispatch calls editor.dispatch', () => {
      const dispatchMock = vi.fn();
      const { context } = createHeadlessEditor({ dispatch: dispatchMock });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      const shimArg = mockBinding.initView.mock.calls[0][0];
      const mockTr = { steps: [] };
      shimArg.dispatch(mockTr);

      expect(dispatchMock).toHaveBeenCalledWith(mockTr);
    });

    it('cleans up transaction listener on editor destroy', () => {
      const { editor, context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(editor.once).toHaveBeenCalledWith('destroy', expect.any(Function));

      const cleanupFn = getDestroyCleanup(editor);
      expect(cleanupFn).toBeDefined();

      const transactionHandler = getTransactionListener(editor);
      expect(transactionHandler).toBeDefined();

      cleanupFn();

      expect(editor.off).toHaveBeenCalledWith('transaction', transactionHandler);
    });

    it('does not register duplicate headless listeners when onCreate runs after addPmPlugins', () => {
      const { editor, context } = createHeadlessEditor();

      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);
      Collaboration.config.onCreate.call(context);

      const transactionListenerRegistrations = editor.on.mock.calls.filter(([event]) => event === 'transaction');
      const destroyCleanupRegistrations = editor.once.mock.calls.filter(([event]) => event === 'destroy');

      expect(transactionListenerRegistrations).toHaveLength(1);
      expect(destroyCleanupRegistrations).toHaveLength(1);
      expect(mockBinding.initView).toHaveBeenCalledTimes(1);
    });

    it('re-initializes binding when sync plugin binding changes between transactions', () => {
      const { editor, context } = createHeadlessEditor({ state: { doc: { type: 'doc', content: [] } } });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(mockBinding.initView).toHaveBeenCalledTimes(1);

      // Simulate a new binding (e.g. after ydoc reconnect)
      const newBinding = {
        initView: vi.fn(),
        _forceRerender: vi.fn(),
        mux: vi.fn((fn) => fn()),
        _prosemirrorChanged: vi.fn(),
      };
      YProsemirror.ySyncPluginKey.getState.mockReturnValue({ binding: newBinding });

      const transactionListener = getTransactionListener(editor);
      transactionListener({ transaction: { getMeta: vi.fn().mockReturnValue(null) } });

      // New binding should have been initialized
      expect(newBinding.initView).toHaveBeenCalledTimes(1);
      expect(newBinding._forceRerender).toHaveBeenCalledTimes(1);
      expect(newBinding._prosemirrorChanged).toHaveBeenCalledWith(editor.state.doc);
    });

    it('cleanup allows fresh binding state on subsequent initHeadlessBinding calls', () => {
      const { editor, context } = createHeadlessEditor();
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      expect(mockBinding.initView).toHaveBeenCalledTimes(1);

      // Trigger cleanup (simulates editor destroy)
      const cleanupFn = getDestroyCleanup(editor);
      cleanupFn();

      // Reset mocks and re-initialize for a fresh editor lifecycle
      mockBinding.initView.mockClear();
      mockBinding._forceRerender.mockClear();

      // A second addPmPlugins + onCreate cycle should create a fresh binding
      const context2 = { editor, options: {} };
      Collaboration.config.addPmPlugins.call(context2);
      Collaboration.config.onCreate.call(context2);

      expect(mockBinding.initView).toHaveBeenCalledTimes(1);
    });

    it('calls initializeMetaMap for new files in headless mode', () => {
      const ydoc = createYDocStub();
      const { context } = createHeadlessEditor({
        ydoc,
        options: {
          isNewFile: true,
          content: { 'word/document.xml': '<doc />' },
          fonts: { 'font1.ttf': new Uint8Array([1]) },
          mediaFiles: { 'word/media/img.png': new Uint8Array([5]) },
        },
      });
      Collaboration.config.addPmPlugins.call(context);
      Collaboration.config.onCreate.call(context);

      // initializeMetaMap seeds fonts, bootstrap metadata, and media
      const metaStore = ydoc._maps.metas.store;
      expect(metaStore.get('fonts')).toEqual({ 'font1.ttf': new Uint8Array([1]) });
      expect(metaStore.get('bootstrap')).toEqual(expect.objectContaining({ version: 1, source: 'browser' }));
      expect(ydoc._maps.media.set).toHaveBeenCalledWith('word/media/img.png', new Uint8Array([5]));
    });
  });
});
