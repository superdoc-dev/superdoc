import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('y-prosemirror', () => ({
  ySyncPlugin: vi.fn(() => 'y-sync-plugin'),
  prosemirrorToYDoc: vi.fn(),
}));

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
    const DEBOUNCE_DELAY_MS = 1000;

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
});
