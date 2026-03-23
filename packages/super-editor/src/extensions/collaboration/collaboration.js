import { Extension } from '@core/Extension.js';
import { PluginKey } from 'prosemirror-state';
import { encodeStateAsUpdate } from 'yjs';
import { ySyncPlugin, ySyncPluginKey, yUndoPluginKey, prosemirrorToYDoc } from 'y-prosemirror';
import {
  isCollaborationProviderSynced,
  onCollaborationProviderSynced,
} from '../../core/helpers/collaboration-provider-sync.js';
import { bootstrapPartSync } from './part-sync/index.js';
import { seedPartsFromEditor } from './part-sync/seed-parts.js';

export const CollaborationPluginKey = new PluginKey('collaboration');
const headlessBindingStateByEditor = new WeakMap();
const headlessCleanupRegisteredEditors = new WeakSet();
const META_BODY_SECT_PR_KEY = 'bodySectPr';
const BODY_SECT_PR_SYNC_META_KEY = 'bodySectPrSync';

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

const cloneJsonValue = (value) => {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
};

const serializeComparableValue = (value) => JSON.stringify(value ?? null);

const getEditorBodySectPr = (editor) => editor?.state?.doc?.attrs?.bodySectPr ?? null;

const setEditorConverterBodySectPr = (editor, bodySectPr) => {
  if (!editor?.converter) return;
  editor.converter.bodySectPr = cloneJsonValue(bodySectPr);
};

const syncBodySectPrToMetaMap = (ydoc, editor) => {
  const metaMap = ydoc.getMap('meta');
  const nextBodySectPr = cloneJsonValue(getEditorBodySectPr(editor));
  const currentMetaBodySectPr = cloneJsonValue(metaMap.get(META_BODY_SECT_PR_KEY) ?? null);

  setEditorConverterBodySectPr(editor, nextBodySectPr);

  if (serializeComparableValue(nextBodySectPr) === serializeComparableValue(currentMetaBodySectPr)) {
    return false;
  }

  metaMap.set(META_BODY_SECT_PR_KEY, nextBodySectPr);
  return true;
};

const applyBodySectPrFromMetaMap = (editor, ydoc) => {
  const nextBodySectPr = cloneJsonValue(ydoc.getMap('meta').get(META_BODY_SECT_PR_KEY) ?? null);
  const currentBodySectPr = cloneJsonValue(getEditorBodySectPr(editor));

  setEditorConverterBodySectPr(editor, nextBodySectPr);

  if (serializeComparableValue(nextBodySectPr) === serializeComparableValue(currentBodySectPr)) {
    return false;
  }

  if (!editor?.state?.tr) return false;

  const tr = editor.state.tr
    .setDocAttribute('bodySectPr', nextBodySectPr)
    .setMeta('addToHistory', false)
    .setMeta(BODY_SECT_PR_SYNC_META_KEY, true);

  if (typeof editor.dispatch === 'function') {
    editor.dispatch(tr);
    return true;
  }

  if (typeof editor.view?.dispatch === 'function') {
    editor.view.dispatch(tr);
    return true;
  }

  return false;
};

const registerBodySectPrSync = (editor, ydoc, provider, cleanupState) => {
  const metaMap = ydoc.getMap('meta');
  const metaMapObserver = (event) => {
    if (!event?.changes?.keys?.has?.(META_BODY_SECT_PR_KEY)) return;
    applyBodySectPrFromMetaMap(editor, ydoc);
  };
  metaMap.observe(metaMapObserver);
  cleanupState.metaMap = metaMap;
  cleanupState.metaMapObserver = metaMapObserver;

  const applyInitialBodySectPr = () => {
    if (editor.isDestroyed) return;
    applyBodySectPrFromMetaMap(editor, ydoc);
  };

  if (!provider) {
    applyInitialBodySectPr();
  } else {
    cleanupState.bodySectPrPendingCleanup = onCollaborationProviderSynced(provider, applyInitialBodySectPr);
  }

  if (typeof editor.on === 'function' && !editor.options?.isHeadless) {
    const bodySectPrTransactionHandler = ({ transaction }) => {
      if (!transaction || transaction.getMeta?.(BODY_SECT_PR_SYNC_META_KEY)) return;

      const isYjsOrigin = Boolean(transaction.getMeta?.(ySyncPluginKey)?.isChangeOrigin);
      if (isYjsOrigin) {
        applyBodySectPrFromMetaMap(editor, ydoc);
        return;
      }

      const previousBodySectPr = cloneJsonValue(transaction.before?.attrs?.bodySectPr ?? null);
      const nextBodySectPr = cloneJsonValue(getEditorBodySectPr(editor));

      if (serializeComparableValue(previousBodySectPr) === serializeComparableValue(nextBodySectPr)) {
        return;
      }

      syncBodySectPrToMetaMap(ydoc, editor);
    };

    editor.on('transaction', bodySectPrTransactionHandler);
    cleanupState.bodySectPrTransactionHandler = bodySectPrTransactionHandler;
  }
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

    const [syncPlugin, fragment] = createSyncPlugin(this.options.ydoc, this.editor);
    this.options.fragment = fragment;

    const mediaMap = this.options.ydoc.getMap('media');
    const mediaMapObserver = (event) => {
      event.changes.keys.forEach((_, key) => {
        if (!(key in this.editor.storage.image.media)) {
          const fileData = mediaMap.get(key);
          this.editor.storage.image.media[key] = fileData;
        }
      });
    };
    mediaMap.observe(mediaMapObserver);

    // Store cleanup references in a non-reactive WeakMap (NOT this.options)
    // to avoid Vue's deep traverse hitting circular references in Y.js Maps.
    const cleanupState = {
      mediaMap,
      mediaMapObserver,
      metaMap: null,
      metaMapObserver: null,
      partSyncHandle: null,
      partSyncPendingCleanup: null,
      bodySectPrPendingCleanup: null,
      bodySectPrTransactionHandler: null,
    };
    collaborationCleanupByEditor.set(this.editor, cleanupState);

    registerBodySectPrSync(this.editor, this.options.ydoc, this.editor.options.collaborationProvider, cleanupState);

    // Bootstrap part-sync (publisher + consumer) — always active.
    // Requires a full editor with event emitter — skip for minimal test mocks.
    // Deferred until provider is synced so Yjs state is available for
    // capability detection and migration.
    const hasEventEmitter = typeof this.editor.on === 'function';

    if (hasEventEmitter) {
      const editor = this.editor;
      const ydoc = this.options.ydoc;
      const doBootstrap = () => {
        if (editor.isDestroyed) return;
        cleanupState.partSyncHandle = bootstrapPartSync(editor, ydoc);
      };

      const provider = editor.options.collaborationProvider;
      if (!provider || isCollaborationProviderSynced(provider)) {
        doBootstrap();
      } else {
        cleanupState.partSyncPendingCleanup = onCollaborationProviderSynced(provider, doBootstrap);
      }
    }

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

    // Clean up Y.js media map observer
    cleanup.mediaMap.unobserve(cleanup.mediaMapObserver);
    cleanup.metaMap?.unobserve?.(cleanup.metaMapObserver);

    // Clean up part-sync publisher/consumer (or pending sync listener)
    cleanup.partSyncHandle?.destroy();
    cleanup.partSyncPendingCleanup?.();
    cleanup.bodySectPrPendingCleanup?.();
    if (cleanup.bodySectPrTransactionHandler && typeof this.editor.off === 'function') {
      this.editor.off('transaction', cleanup.bodySectPrTransactionHandler);
    }

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

/**
 * Seed non-document parts and media into the Yjs maps for a new room.
 *
 * Parts are seeded via `seedPartsFromEditor` (writes to `parts` map with
 * capability marker). Media and bootstrap metadata are written separately.
 */
export const initializeMetaMap = (ydoc, editor) => {
  // 1. Seed non-document parts into Yjs parts map
  seedPartsFromEditor(editor, ydoc);

  // 2. Seed media files
  const mediaMap = ydoc.getMap('media');
  Object.entries(editor.options.mediaFiles).forEach(([key, value]) => {
    mediaMap.set(key, value);
  });

  // 3. Sync root-level section defaults that Yjs fragments cannot represent.
  syncBodySectPrToMetaMap(ydoc, editor);

  // 4. Bootstrap metadata
  const metaMap = ydoc.getMap('meta');
  metaMap.set('fonts', editor.options.fonts);
  metaMap.set('bootstrap', {
    version: 1,
    clientId: ydoc.clientID,
    seededAt: new Date().toISOString(),
    source: 'browser',
  });
};

const initSyncListener = (ydoc, editor, extension) => {
  const provider = editor.options.collaborationProvider;
  if (!provider) return;

  const emit = (synced) => {
    if (synced === false) return;
    extension.options.isReady = true;
    editor.emit('collaborationReady', { editor, ydoc });
  };

  if (isCollaborationProviderSynced(provider)) {
    setTimeout(() => {
      emit();
    }, 250);
    return;
  }

  onCollaborationProviderSynced(provider, emit);
};

export const generateCollaborationData = async (editor) => {
  const ydoc = prosemirrorToYDoc(editor.state.doc, 'supereditor');
  initializeMetaMap(ydoc, editor);
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
    if (meta?.isChangeOrigin) {
      applyBodySectPrFromMetaMap(editor, editor.options.ydoc);
      return;
    }
    if (transaction.getMeta?.(BODY_SECT_PR_SYNC_META_KEY)) return;

    const previousBodySectPr = cloneJsonValue(transaction.before?.attrs?.bodySectPr ?? null);
    const nextBodySectPr = cloneJsonValue(getEditorBodySectPr(editor));
    const bodySectPrChanged = serializeComparableValue(previousBodySectPr) !== serializeComparableValue(nextBodySectPr);

    // Sync document content to Y.js via binding (when available)
    const binding = ensureInitializedBinding();

    if (binding && typeof binding._prosemirrorChanged === 'function') {
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
      } else {
        syncToYjs();
      }
    }

    // Sync bodySectPr metadata separately (not part of Y.js fragment)
    if (bodySectPrChanged) {
      syncBodySectPrToMetaMap(editor.options.ydoc, editor);
    }
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
