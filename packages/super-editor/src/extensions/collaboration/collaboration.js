import { Extension } from '@core/index.js';
import { PluginKey } from 'prosemirror-state';
import { encodeStateAsUpdate } from 'yjs';
import { ySyncPlugin, ySyncPluginKey, prosemirrorToYDoc } from 'y-prosemirror';
import { updateYdocDocxData, applyRemoteHeaderFooterChanges } from '@extensions/collaboration/collaboration-helpers.js';

export const CollaborationPluginKey = new PluginKey('collaboration');

export const Collaboration = Extension.create({
  name: 'collaboration',

  priority: 1000,

  addOptions() {
    return {
      ydoc: null,
      field: 'supereditor',
      fragment: null,
      isReady: false,
    };
  },

  addPmPlugins() {
    if (!this.editor.options.ydoc) return [];
    this.options.ydoc = this.editor.options.ydoc;

    initSyncListener(this.options.ydoc, this.editor, this);
    initDocumentListener({ ydoc: this.options.ydoc, editor: this.editor });

    const [syncPlugin, fragment] = createSyncPlugin(this.options.ydoc, this.editor);
    this.options.fragment = fragment;

    const metaMap = this.options.ydoc.getMap('media');
    metaMap.observe((event) => {
      event.changes.keys.forEach((_, key) => {
        if (!(key in this.editor.storage.image.media)) {
          const fileData = metaMap.get(key);
          this.editor.storage.image.media[key] = fileData;
        }
      });
    });

    // Observer for remote header/footer JSON changes
    const headerFooterMap = this.options.ydoc.getMap('headerFooterJson');
    headerFooterMap.observe((event) => {
      // Only process remote changes (not our own)
      if (event.transaction.local) return;

      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = headerFooterMap.get(key);
          if (data) {
            applyRemoteHeaderFooterChanges(this.editor, key, data);
          }
        }
      });
    });

    return [syncPlugin];
  },

  onCreate() {
    // In headless mode, manually initialize the Y.js binding since no EditorView is created
    // This must happen in onCreate (after state is created) because we need access to the plugin state
    if (this.editor.options.isHeadless && this.editor.options.ydoc) {
      const cleanup = initHeadlessBinding(this.editor);
      if (cleanup) {
        this.editor.once('destroy', cleanup);
      }
    }
  },

  addCommands() {
    return {
      addImageToCollaboration:
        ({ mediaPath, fileData }) =>
        () => {
          if (!this.options.ydoc || !mediaPath || !fileData) return false;
          const mediaMap = this.options.ydoc.getMap('media');
          mediaMap.set(mediaPath, fileData);
          return true;
        },
    };
  },
});

export const createSyncPlugin = (ydoc, editor) => {
  const fragment = ydoc.getXmlFragment('supereditor');
  const onFirstRender = () => {
    if (!editor.options.isNewFile) return;
    initializeMetaMap(ydoc, editor);
  };

  return [ySyncPlugin(fragment, { onFirstRender }), fragment];
};

export const initializeMetaMap = (ydoc, editor) => {
  const metaMap = ydoc.getMap('meta');
  metaMap.set('docx', editor.options.content);
  metaMap.set('fonts', editor.options.fonts);

  const mediaMap = ydoc.getMap('media');
  Object.entries(editor.options.mediaFiles).forEach(([key, value]) => {
    mediaMap.set(key, value);
  });
};

const checkDocxChanged = (transaction) => {
  if (!transaction.changed) return false;

  for (const [, value] of transaction.changed.entries()) {
    if (value instanceof Set && value.has('docx')) {
      return true;
    }
  }

  return false;
};

const initDocumentListener = ({ ydoc, editor }) => {
  const debouncedUpdate = debounce((editor) => {
    updateYdocDocxData(editor);
  }, 1000);

  ydoc.on('afterTransaction', (transaction) => {
    const { local } = transaction;

    const hasChangedDocx = checkDocxChanged(transaction);
    if (!hasChangedDocx && transaction.changed?.size && local) {
      debouncedUpdate(editor);
    }
  });
};

const debounce = (fn, wait) => {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
};

const initSyncListener = (ydoc, editor, extension) => {
  const provider = editor.options.collaborationProvider;
  if (!provider) return;

  const emit = () => {
    extension.options.isReady = true;
    provider.off('synced', emit);
    editor.emit('collaborationReady', { editor, ydoc });
  };

  if (provider.synced) {
    setTimeout(() => {
      emit();
    }, 250);
    return;
  }
  provider.on('synced', emit);
};

export const generateCollaborationData = async (editor) => {
  const ydoc = prosemirrorToYDoc(editor.state.doc, 'supereditor');
  initializeMetaMap(ydoc, editor);
  await updateYdocDocxData(editor, ydoc);
  return encodeStateAsUpdate(ydoc);
};

/**
 * Initialize Y.js sync binding for headless mode.
 *
 * In normal (non-headless) mode, ySyncPlugin's `view` callback calls
 * `binding.initView(view)` when the EditorView is created. In headless
 * mode, no EditorView exists, so we create a minimal shim that satisfies
 * y-prosemirror's requirements.
 *
 * @param {Editor} editor - The SuperEditor instance in headless mode
 * @returns {Function|undefined} Cleanup function to remove event listeners
 */
const initHeadlessBinding = (editor) => {
  const syncState = ySyncPluginKey.getState(editor.state);
  if (!syncState?.binding) {
    console.warn('[Collaboration] Headless binding init: no sync state or binding found');
    return;
  }

  const binding = syncState.binding;

  // Create a minimal EditorView shim that satisfies y-prosemirror's interface
  // See: y-prosemirror/src/plugins/sync-plugin.js initView() and _typeChanged()
  const headlessViewShim = {
    get state() {
      return editor.state;
    },
    dispatch: (tr) => {
      editor.dispatch(tr);
    },
    hasFocus: () => false,
    // Minimal DOM stubs required by y-prosemirror's renderSnapshot/undo operations
    _root: {
      getSelection: () => null,
      createRange: () => ({}),
    },
  };

  // Initialize the binding with our shim
  binding.initView(headlessViewShim);

  // Listen for ProseMirror transactions and sync to Y.js
  // This replicates the behavior of ySyncPlugin's view.update callback
  // Note: _prosemirrorChanged is internal to y-prosemirror but is the recommended
  // approach for headless mode (see y-prosemirror issue #75)
  const transactionHandler = ({ transaction }) => {
    // Skip if this transaction originated from Y.js (avoid infinite loop)
    const meta = transaction.getMeta(ySyncPluginKey);
    if (meta?.isChangeOrigin) return;

    // Sync ProseMirror changes to Y.js
    binding._prosemirrorChanged(editor.state.doc);
  };

  editor.on('transaction', transactionHandler);

  // Return cleanup function to remove listener on destroy
  return () => {
    editor.off('transaction', transactionHandler);
  };
};
