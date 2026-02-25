import { Extension } from '@core/index.js';
import { PluginKey } from 'prosemirror-state';
import { encodeStateAsUpdate } from 'yjs';
import { ySyncPlugin, ySyncPluginKey, yUndoPluginKey, prosemirrorToYDoc } from 'y-prosemirror';
import { updateYdocDocxData, applyRemoteHeaderFooterChanges } from '@extensions/collaboration/collaboration-helpers.js';

export const CollaborationPluginKey = new PluginKey('collaboration');
const headlessBindingStateByEditor = new WeakMap();
const headlessCleanupRegisteredEditors = new WeakSet();

// Store Y.js observer references outside of reactive `this.options` to avoid
// Vue's deep traverse hitting circular references inside Y.js Map internals.
const collaborationCleanupByEditor = new WeakMap();

const registerHeadlessBindingCleanup = (editor, cleanup) => {
  if (!cleanup || headlessCleanupRegisteredEditors.has(editor)) return;

  headlessCleanupRegisteredEditors.add(editor);
  editor.once('destroy', () => {
    cleanup();
    headlessCleanupRegisteredEditors.delete(editor);
  });
};

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
    const documentListenerCleanup = initDocumentListener({ ydoc: this.options.ydoc, editor: this.editor });

    const [syncPlugin, fragment] = createSyncPlugin(this.options.ydoc, this.editor);
    this.options.fragment = fragment;

    const metaMap = this.options.ydoc.getMap('media');
    const metaMapObserver = (event) => {
      event.changes.keys.forEach((_, key) => {
        if (!(key in this.editor.storage.image.media)) {
          const fileData = metaMap.get(key);
          this.editor.storage.image.media[key] = fileData;
        }
      });
    };
    metaMap.observe(metaMapObserver);

    // Observer for remote header/footer JSON changes
    const headerFooterMap = this.options.ydoc.getMap('headerFooterJson');
    const headerFooterMapObserver = (event) => {
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
    };
    headerFooterMap.observe(headerFooterMapObserver);

    // Store cleanup references in a non-reactive WeakMap (NOT this.options)
    // to avoid Vue's deep traverse hitting circular references in Y.js Maps.
    collaborationCleanupByEditor.set(this.editor, {
      metaMap,
      metaMapObserver,
      headerFooterMap,
      headerFooterMapObserver,
      documentListenerCleanup,
    });

    // Headless editors don't create an EditorView, so wire Y.js binding lifecycle here.
    // Doing this in addPmPlugins ensures sync hooks are active before the first local transaction.
    if (this.editor.options.isHeadless) {
      const cleanup = initHeadlessBinding(this.editor);
      registerHeadlessBindingCleanup(this.editor, cleanup);
    }

    return [syncPlugin];
  },

  onCreate() {
    // Keep this as a fallback for custom lifecycles that may bypass addPmPlugins.
    if (this.editor.options.isHeadless && this.editor.options.ydoc) {
      const cleanup = initHeadlessBinding(this.editor);
      registerHeadlessBindingCleanup(this.editor, cleanup);
    }
  },

  onDestroy() {
    const cleanup = collaborationCleanupByEditor.get(this.editor);
    if (!cleanup) return;

    // Clean up Y.js map observers to prevent memory leaks
    cleanup.metaMap.unobserve(cleanup.metaMapObserver);
    cleanup.headerFooterMap.unobserve(cleanup.headerFooterMapObserver);

    // Clean up ydoc afterTransaction listener and debounce timer
    cleanup.documentListenerCleanup();

    collaborationCleanupByEditor.delete(this.editor);
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
  // 30s debounce: the actual document content syncs in real-time via
  // y-prosemirror's XmlFragment. This DOCX blob is supplementary data
  // (for new joiners' converter setup). Writing it every 1s generates
  // large Y.js updates (full DOCX XML) that accumulate as Y.Map
  // tombstones, gradually growing the room's stored data until
  // Liveblocks rejects connections with code 1011.
  const debouncedUpdate = debounce(
    (editor) => {
      updateYdocDocxData(editor);
    },
    30000,
    { maxWait: 60000 },
  );

  const afterTransactionHandler = (transaction) => {
    const { local } = transaction;

    const hasChangedDocx = checkDocxChanged(transaction);
    if (!hasChangedDocx && transaction.changed?.size && local) {
      debouncedUpdate(editor);
    }
  };

  ydoc.on('afterTransaction', afterTransactionHandler);

  // Return cleanup function
  return () => {
    ydoc.off('afterTransaction', afterTransactionHandler);
    debouncedUpdate.cancel();
  };
};

const debounce = (fn, wait, { maxWait } = {}) => {
  let timeout = null;
  let maxTimeout = null;
  let latestArgs = null;

  const invoke = () => {
    clearTimeout(timeout);
    clearTimeout(maxTimeout);
    timeout = null;
    maxTimeout = null;
    const args = latestArgs;
    latestArgs = null;
    if (args !== null) fn(...args);
  };

  const debounced = (...args) => {
    latestArgs = args;
    clearTimeout(timeout);
    timeout = setTimeout(invoke, wait);
    if (maxWait != null && maxTimeout == null) {
      maxTimeout = setTimeout(invoke, maxWait);
    }
  };

  debounced.cancel = () => {
    clearTimeout(timeout);
    clearTimeout(maxTimeout);
    timeout = null;
    maxTimeout = null;
    latestArgs = null;
  };

  return debounced;
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
  const existing = headlessBindingStateByEditor.get(editor);
  if (existing?.cleanup) {
    return existing.cleanup;
  }

  const state = {
    binding: null,
    cleanup: null,
    warnedMissingBinding: false,
  };
  headlessBindingStateByEditor.set(editor, state);

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

  const ensureInitializedBinding = () => {
    if (!editor.options.ydoc || !editor.state) return null;
    const syncState = ySyncPluginKey.getState(editor.state);
    if (!syncState?.binding) {
      if (!state.warnedMissingBinding) {
        console.warn('[Collaboration] Headless binding init: no sync state or binding found');
        state.warnedMissingBinding = true;
      }
      return null;
    }

    state.warnedMissingBinding = false;
    const binding = syncState.binding;
    if (state.binding === binding) {
      return binding;
    }

    binding.initView(headlessViewShim);

    // ySyncPlugin's view lifecycle forces a rerender on first mount so PM state reflects Yjs.
    if (typeof binding._forceRerender === 'function') {
      binding._forceRerender();
    }

    // Mirror ySyncPlugin's onFirstRender callback behavior for new files in headless mode.
    if (editor.options.isNewFile) {
      initializeMetaMap(editor.options.ydoc, editor);
    }

    state.binding = binding;
    return binding;
  };

  // Listen for ProseMirror transactions and sync to Y.js
  // This replicates the behavior of ySyncPlugin's view.update callback
  // Note: _prosemirrorChanged is internal to y-prosemirror but is the recommended
  // approach for headless mode (see y-prosemirror issue #75)
  const transactionHandler = ({ transaction }) => {
    if (!editor.options.ydoc) return;

    // Skip if this transaction originated from Y.js (avoid infinite loop)
    const meta = transaction.getMeta(ySyncPluginKey);
    if (meta?.isChangeOrigin) return;

    const binding = ensureInitializedBinding();
    if (!binding) return;

    // Sync ProseMirror changes to Y.js
    if (typeof binding._prosemirrorChanged !== 'function') return;
    const addToHistory = transaction.getMeta('addToHistory') !== false;

    // Match y-prosemirror view.update behavior for non-history changes.
    if (!addToHistory) {
      const undoPluginState = yUndoPluginKey.getState(editor.state);
      undoPluginState?.undoManager?.stopCapturing?.();
    }

    const syncToYjs = () => {
      const ydoc = editor.options.ydoc;
      if (!ydoc) return;

      ydoc.transact((tr) => {
        tr?.meta?.set?.('addToHistory', addToHistory);
        binding._prosemirrorChanged(editor.state.doc);
      }, ySyncPluginKey);
    };

    if (typeof binding.mux === 'function') {
      binding.mux(syncToYjs);
      return;
    }

    syncToYjs();
  };

  editor.on('transaction', transactionHandler);
  ensureInitializedBinding();

  // Return cleanup function to remove listener on destroy
  state.cleanup = () => {
    editor.off('transaction', transactionHandler);
    if (headlessBindingStateByEditor.get(editor) === state) {
      headlessBindingStateByEditor.delete(editor);
    }
    headlessCleanupRegisteredEditors.delete(editor);
  };
  return state.cleanup;
};
