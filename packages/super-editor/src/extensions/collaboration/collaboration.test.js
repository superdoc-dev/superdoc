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
import * as CollaborationHelpers from './collaboration-helpers.js';

const { Collaboration, CollaborationPluginKey, createSyncPlugin, initializeMetaMap, generateCollaborationData } =
  CollaborationModule;
const { updateYdocDocxData } = CollaborationHelpers;

const createYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  let observer;
  return {
    set: vi.fn((key, value) => {
      store.set(key, value);
    }),
    get: vi.fn((key) => store.get(key)),
    observe: vi.fn((fn) => {
      observer = fn;
    }),
    _trigger(keys) {
      observer?.({ changes: { keys } });
    },
    store,
  };
};

const createYDocStub = ({ docxValue, hasDocx = true } = {}) => {
  const initialMetaEntries = hasDocx ? { docx: docxValue ?? [] } : {};
  const metas = createYMap(initialMetaEntries);
  if (!hasDocx) metas.store.delete('docx');
  const media = createYMap();
  const headerFooterJson = createYMap();
  const listeners = {};
  return {
    getXmlFragment: vi.fn(() => ({ fragment: true })),
    getMap: vi.fn((name) => {
      if (name === 'meta') return metas;
      if (name === 'headerFooterJson') return headerFooterJson;
      return media;
    }),
    on: vi.fn((event, handler) => {
      listeners[event] = handler;
    }),
    transact: vi.fn((fn, meta) => fn(meta)),
    _maps: { metas, media, headerFooterJson },
    _listeners: listeners,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collaboration helpers', () => {
  it('updates docx payloads inside the ydoc meta map', async () => {
    const ydoc = createYDocStub();
    const metas = ydoc._maps.metas;
    metas.store.set('docx', [{ name: 'word/document.xml', content: '<old />' }]);

    const editor = {
      options: { ydoc, user: { id: 'user-1' } },
      exportDocx: vi.fn().mockResolvedValue({ 'word/document.xml': '<new />', 'word/styles.xml': '<styles />' }),
    };

    await updateYdocDocxData(editor);

    expect(editor.exportDocx).toHaveBeenCalledWith({ getUpdatedDocs: true });
    expect(metas.set).toHaveBeenCalledWith('docx', [
      { name: 'word/document.xml', content: '<new />' },
      { name: 'word/styles.xml', content: '<styles />' },
    ]);
    expect(ydoc.transact).toHaveBeenCalledWith(expect.any(Function), {
      event: 'docx-update',
      user: editor.options.user,
    });
  });

  it('returns early when neither explicit ydoc nor editor.options.ydoc exist', async () => {
    const editor = {
      options: { ydoc: null, user: { id: 'user-1' }, content: [] },
      exportDocx: vi.fn(),
    };

    await updateYdocDocxData(editor);

    expect(editor.exportDocx).not.toHaveBeenCalled();
  });

  it('normalizes docx arrays via toArray when meta map stores a Y.Array-like structure', async () => {
    const docxSource = {
      toArray: vi.fn(() => [{ name: 'word/document.xml', content: '<old />' }]),
    };
    const ydoc = createYDocStub({ docxValue: docxSource });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'user-2' }, content: [] },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<new />',
        'word/styles.xml': '<styles />',
      }),
    };

    await updateYdocDocxData(editor);

    expect(docxSource.toArray).toHaveBeenCalled();
    expect(metas.set).toHaveBeenCalledWith('docx', [
      { name: 'word/document.xml', content: '<new />' },
      { name: 'word/styles.xml', content: '<styles />' },
    ]);
  });

  it('normalizes docx payloads when meta map stores an iterable collection', async () => {
    const docxSet = new Set([
      { name: 'word/document.xml', content: '<old />' },
      { name: 'word/numbering.xml', content: '<numbers />' },
    ]);
    const ydoc = createYDocStub({ docxValue: docxSet });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'user-3' }, content: [] },
      exportDocx: vi.fn().mockResolvedValue({ 'word/document.xml': '<new />' }),
    };

    await updateYdocDocxData(editor);

    expect(metas.set).toHaveBeenCalledWith('docx', [
      { name: 'word/numbering.xml', content: '<numbers />' },
      { name: 'word/document.xml', content: '<new />' },
    ]);
  });

  it('falls back to editor options content when no docx entry exists in the meta map', async () => {
    const initialContent = [
      { name: 'word/document.xml', content: '<initial />' },
      { name: 'word/footnotes.xml', content: '<foot />' },
    ];
    const ydoc = createYDocStub({ hasDocx: false });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'user-4' }, content: initialContent },
      exportDocx: vi.fn().mockResolvedValue({ 'word/document.xml': '<updated />' }),
    };

    await updateYdocDocxData(editor);

    expect(metas.set).toHaveBeenCalledWith('docx', [
      { name: 'word/footnotes.xml', content: '<foot />' },
      { name: 'word/document.xml', content: '<updated />' },
    ]);
    const originalDocEntry = initialContent.find((entry) => entry.name === 'word/document.xml');
    expect(originalDocEntry.content).toBe('<initial />');
  });

  it('prefers the explicit ydoc argument over editor options', async () => {
    const optionsYdoc = createYDocStub();
    const explicitYdoc = createYDocStub();
    explicitYdoc._maps.metas.store.set('docx', [{ name: 'word/document.xml', content: '<old explicit />' }]);

    const editor = {
      options: { ydoc: optionsYdoc, user: { id: 'user-5' } },
      exportDocx: vi.fn().mockResolvedValue({ 'word/document.xml': '<new explicit />' }),
    };

    await updateYdocDocxData(editor, explicitYdoc);

    expect(explicitYdoc._maps.metas.set).toHaveBeenCalledWith('docx', [
      { name: 'word/document.xml', content: '<new explicit />' },
    ]);
    expect(optionsYdoc._maps.metas.set).not.toHaveBeenCalled();
  });

  it('skips transaction when docx content has not changed', async () => {
    const existingDocx = [
      { name: 'word/document.xml', content: '<same />' },
      { name: 'word/styles.xml', content: '<styles />' },
    ];
    const ydoc = createYDocStub({ docxValue: existingDocx });

    const editor = {
      options: { ydoc, user: { id: 'user-1' } },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<same />',
        'word/styles.xml': '<styles />',
      }),
    };

    await updateYdocDocxData(editor);

    expect(editor.exportDocx).toHaveBeenCalledWith({ getUpdatedDocs: true });
    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('updates only changed files and triggers transaction', async () => {
    const existingDocx = [
      { name: 'word/document.xml', content: '<old />' },
      { name: 'word/styles.xml', content: '<styles />' },
    ];
    const ydoc = createYDocStub({ docxValue: existingDocx });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'user-1' } },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<new />',
        'word/styles.xml': '<styles />',
      }),
    };

    await updateYdocDocxData(editor);

    expect(ydoc.transact).toHaveBeenCalled();
    expect(metas.set).toHaveBeenCalledWith(
      'docx',
      expect.arrayContaining([
        { name: 'word/styles.xml', content: '<styles />' },
        { name: 'word/document.xml', content: '<new />' },
      ]),
    );
  });

  it('does not persist null comment xml payloads into meta.docx', async () => {
    const existingDocx = [
      { name: 'word/document.xml', content: '<old doc />' },
      { name: 'word/comments.xml', content: '<old comments />' },
      { name: 'word/commentsExtended.xml', content: '<old comments extended />' },
    ];
    const ydoc = createYDocStub({ docxValue: existingDocx });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'user-null-comments' } },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<new doc />',
        'word/comments.xml': null,
        'word/commentsExtended.xml': null,
      }),
    };

    await updateYdocDocxData(editor);

    const persistedDocx = metas.set.mock.calls.at(-1)?.[1] || [];
    expect(persistedDocx.some((file) => file.name === 'word/comments.xml')).toBe(false);
    expect(persistedDocx.some((file) => file.name === 'word/commentsExtended.xml')).toBe(false);
    expect(persistedDocx.every((file) => typeof file.content === 'string')).toBe(true);
  });

  it('triggers transaction when new file is added', async () => {
    const existingDocx = [{ name: 'word/document.xml', content: '<doc />' }];
    const ydoc = createYDocStub({ docxValue: existingDocx });

    const editor = {
      options: { ydoc, user: { id: 'user-1' } },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<doc />',
        'word/numbering.xml': '<numbering />',
      }),
    };

    await updateYdocDocxData(editor);

    expect(ydoc.transact).toHaveBeenCalled();
  });

  it('skips transaction when multiple files all remain unchanged', async () => {
    const existingDocx = [
      { name: 'word/document.xml', content: '<doc />' },
      { name: 'word/styles.xml', content: '<styles />' },
      { name: 'word/numbering.xml', content: '<numbering />' },
    ];
    const ydoc = createYDocStub({ docxValue: existingDocx });

    const editor = {
      options: { ydoc, user: { id: 'user-1' } },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<doc />',
        'word/styles.xml': '<styles />',
        'word/numbering.xml': '<numbering />',
      }),
    };

    await updateYdocDocxData(editor);

    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('initializes docx metadata even when exported content matches initial content', async () => {
    const initialContent = [
      { name: 'word/document.xml', content: '<doc />' },
      { name: 'word/styles.xml', content: '<styles />' },
    ];
    // No docx entry exists in meta map (hasDocx: false)
    const ydoc = createYDocStub({ hasDocx: false });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'user-1' }, content: initialContent },
      // Export returns identical content to initial
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<doc />',
        'word/styles.xml': '<styles />',
      }),
    };

    await updateYdocDocxData(editor);

    // Transaction should still happen to initialize the docx metadata for collaborators
    expect(ydoc.transact).toHaveBeenCalled();
    expect(metas.set).toHaveBeenCalledWith('docx', initialContent);
  });

  it('initializes docx metadata for new documents with no changes', async () => {
    const initialContent = [{ name: 'word/document.xml', content: '<empty />' }];
    const ydoc = createYDocStub({ hasDocx: false });
    const metas = ydoc._maps.metas;

    const editor = {
      options: { ydoc, user: { id: 'new-user' }, content: initialContent },
      exportDocx: vi.fn().mockResolvedValue({
        'word/document.xml': '<empty />',
      }),
    };

    await updateYdocDocxData(editor);

    // Even with no content changes, the metadata must be persisted for collaborators
    expect(ydoc.transact).toHaveBeenCalledWith(expect.any(Function), {
      event: 'docx-update',
      user: editor.options.user,
    });
    expect(metas.set).toHaveBeenCalledWith('docx', initialContent);
  });
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
    expect(ydoc.on).toHaveBeenCalledWith('afterTransaction', expect.any(Function));

    const mediaObserver = ydoc._maps.media.observe.mock.calls[0][0];
    ydoc._maps.media.get.mockReturnValue({ blob: true });
    mediaObserver({ changes: { keys: new Map([['word/media/image.png', {}]]) } });
    expect(editor.storage.image.media['word/media/image.png']).toEqual({ blob: true });
  });

  describe('debounced docx sync', () => {
    const DEBOUNCE_DELAY_MS = 30000;

    const createDebouncedSyncTestContext = () => {
      const updateSpy = vi.spyOn(CollaborationHelpers, 'updateYdocDocxData').mockResolvedValue();
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
      return { updateSpy, ydoc, editor, context };
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces updateYdocDocxData for local non-docx transactions', () => {
      const { updateSpy, ydoc, context } = createDebouncedSyncTestContext();
      Collaboration.config.addPmPlugins.call(context);

      ydoc._listeners.afterTransaction({
        local: true,
        changed: new Map([['headerFooterJson', new Set(['headerFooterJson'])]]),
      });

      expect(updateSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(DEBOUNCE_DELAY_MS - 1);
      expect(updateSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('coalesces rapid transactions into a single update', () => {
      const { updateSpy, ydoc, context } = createDebouncedSyncTestContext();
      Collaboration.config.addPmPlugins.call(context);

      const transaction = {
        local: true,
        changed: new Map([['headerFooterJson', new Set(['headerFooterJson'])]]),
      };

      ydoc._listeners.afterTransaction(transaction);
      vi.advanceTimersByTime(400);
      ydoc._listeners.afterTransaction(transaction);

      vi.advanceTimersByTime(DEBOUNCE_DELAY_MS - 1);
      expect(updateSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('does not starve docx metadata sync during sustained local edits', () => {
      const { updateSpy, ydoc, context } = createDebouncedSyncTestContext();
      Collaboration.config.addPmPlugins.call(context);

      const transaction = {
        local: true,
        changed: new Map([['headerFooterJson', new Set(['headerFooterJson'])]]),
      };

      const sustainedEditIntervalMs = 5000;
      const sustainedEditDurationMs = 2 * 60 * 1000;

      for (let elapsedMs = 0; elapsedMs < sustainedEditDurationMs; elapsedMs += sustainedEditIntervalMs) {
        ydoc._listeners.afterTransaction(transaction);
        vi.advanceTimersByTime(sustainedEditIntervalMs);
      }

      expect(updateSpy).toHaveBeenCalled();
    });
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
    expect(ydoc._maps.metas.set).toHaveBeenCalledWith('docx', editor.options.content);
  });

  it('initializes meta map with content, fonts, and media', () => {
    const ydoc = createYDocStub();
    const editor = {
      options: {
        content: { 'word/document.xml': '<doc />' },
        fonts: { 'font1.ttf': new Uint8Array([1]) },
        mediaFiles: { 'word/media/img.png': new Uint8Array([5]) },
      },
    };

    initializeMetaMap(ydoc, editor);

    const metaStore = ydoc._maps.metas.store;
    expect(metaStore.get('docx')).toEqual(editor.options.content);
    expect(metaStore.get('fonts')).toEqual(editor.options.fonts);
    expect(ydoc._maps.media.set).toHaveBeenCalledWith('word/media/img.png', new Uint8Array([5]));
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
      exportDocx: vi.fn().mockResolvedValue({ 'word/document.xml': '<updated />' }),
    };

    const data = await generateCollaborationData(editor);

    expect(YProsemirror.prosemirrorToYDoc).toHaveBeenCalledWith(doc, 'supereditor');
    expect(Yjs.encodeStateAsUpdate).toHaveBeenCalledWith(ydoc);
    expect(editor.exportDocx).toHaveBeenCalled();
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

      // initializeMetaMap should have been called, writing to the meta map
      const metaStore = ydoc._maps.metas.store;
      expect(metaStore.get('docx')).toEqual({ 'word/document.xml': '<doc />' });
      expect(metaStore.get('fonts')).toEqual({ 'font1.ttf': new Uint8Array([1]) });
      expect(ydoc._maps.media.set).toHaveBeenCalledWith('word/media/img.png', new Uint8Array([5]));
    });
  });
});
