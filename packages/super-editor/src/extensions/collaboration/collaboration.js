import { Extension } from '@core/index.js';
import { PluginKey } from 'prosemirror-state';
import { encodeStateAsUpdate } from 'yjs';
import { ySyncPlugin, ySyncPluginKey, yUndoPluginKey, prosemirrorToYDoc } from 'y-prosemirror';
import {
  publishPartSections,
  hydrateOrSeedPart,
  createSpecObserver,
  applyRemotePartSections,
  deleteRemotePartSections,
} from '@extensions/collaboration/part-sync/part-sync-engine.js';
import {
  STYLES_SPEC,
  HEADER_FOOTER_CONTENT_SPEC,
  getAllSpecs,
  resolveOoxmlPartKey,
  resolvePartChangedSpec,
  invalidateDiscoveredSpecs,
} from '@extensions/collaboration/part-sync/part-spec-registry.js';
import { writeBootstrapContent } from '@extensions/collaboration/part-sync/bootstrap-content.js';
import { maybeRunLegacyBootstrapMigration } from '@extensions/collaboration/part-sync/legacy-bootstrap-migration.js';
import {
  scheduleReconcile,
  destroyReconcileState,
  markDirty,
} from '@extensions/collaboration/part-sync/part-reconcile-scheduler.js';

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

    // Hydrate or seed all structured channels after provider sync.
    const handleCollaborationReady = () => {
      this.editor.off('collaborationReady', handleCollaborationReady);

      maybeRunLegacyBootstrapMigration(this.editor);

      for (const spec of getAllSpecs(this.editor.converter)) {
        hydrateOrSeedPart(this.editor, spec);
      }
    };
    this.editor.on('collaborationReady', handleCollaborationReady);

    const documentListenerCleanup = initDocumentListener({ ydoc: this.options.ydoc, editor: this.editor });

    const [syncPlugin, fragment] = createSyncPlugin(this.options.ydoc, this.editor);
    this.options.fragment = fragment;

    // Media map observer (unchanged — media is binary, not OOXML)
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

    // Header/footer observer (dedicated channel: headerFooterModel)
    const headerFooterMap = this.options.ydoc.getMap('headerFooterModel');
    const headerFooterMapObserver = createSpecObserver(this.editor, HEADER_FOOTER_CONTENT_SPEC);
    headerFooterMap.observe(headerFooterMapObserver);

    // Styles observer (dedicated channel: stylesModel)
    const stylesMap = this.options.ydoc.getMap('stylesModel');
    const stylesMapObserver = createSpecObserver(this.editor, STYLES_SPEC);
    stylesMap.observe(stylesMapObserver);

    // OOXML parts observer (shared channel: ooxmlPartModels)
    const ooxmlPartsMap = this.options.ydoc.getMap('ooxmlPartModels');
    const ooxmlPartsMapObserver = (event) => {
      if (event.transaction.local) return;

      // Group changed keys by spec for batched apply/delete
      const changesBySpec = new Map();
      const deletesBySpec = new Map();
      event.changes.keys.forEach((change, key) => {
        if (key === '_version') return;

        let resolved = resolveOoxmlPartKey(key, this.editor.converter);
        if (!resolved) {
          // Unknown key — a remote client may have created a new part.
          // Invalidate discovery cache and retry so the new part gets a spec.
          invalidateDiscoveredSpecs(this.editor.converter);
          resolved = resolveOoxmlPartKey(key, this.editor.converter);
          if (!resolved) return;
        }

        if (change.action === 'add' || change.action === 'update') {
          if (!changesBySpec.has(resolved.spec.id)) {
            changesBySpec.set(resolved.spec.id, { spec: resolved.spec, keys: [] });
          }
          changesBySpec.get(resolved.spec.id).keys.push(key);
        } else if (change.action === 'delete') {
          if (!deletesBySpec.has(resolved.spec.id)) {
            deletesBySpec.set(resolved.spec.id, { spec: resolved.spec, keys: [] });
          }
          deletesBySpec.get(resolved.spec.id).keys.push(key);
        }
      });

      for (const { spec, keys } of changesBySpec.values()) {
        applyRemotePartSections(this.editor, spec, ooxmlPartsMap, keys);
      }
      for (const { spec, keys } of deletesBySpec.values()) {
        deleteRemotePartSections(this.editor, spec, keys);
      }
    };
    ooxmlPartsMap.observe(ooxmlPartsMapObserver);

    // Local part changes → publish to corresponding Y.Map channel.
    const handlePartChanged = (payload) => {
      if (payload?.source?.startsWith('yjs.remote')) return;

      const resolved = resolvePartChangedSpec(payload.partId, payload.changedPaths, this.editor.converter);
      if (resolved) {
        publishPartSections(this.editor, resolved.spec, resolved.sectionHints);
      }
    };
    this.editor.on('partChanged', handlePartChanged);

    // Store cleanup references in a non-reactive WeakMap (NOT this.options)
    // to avoid Vue's deep traverse hitting circular references in Y.js Maps.
    collaborationCleanupByEditor.set(this.editor, {
      mediaMap,
      mediaMapObserver,
      headerFooterMap,
      headerFooterMapObserver,
      stylesMap,
      stylesMapObserver,
      ooxmlPartsMap,
      ooxmlPartsMapObserver,
      handlePartChanged,
      documentListenerCleanup,
    });

    // Headless editors don't create an EditorView, so wire Y.js binding lifecycle here.
    if (this.editor.options.isHeadless) {
      const cleanup = initHeadlessBinding(this.editor);
      registerHeadlessBindingCleanup(this.editor, cleanup);
    }

    return [syncPlugin];
  },

  onCreate() {
    // Fallback for custom lifecycles that may bypass addPmPlugins.
    if (this.editor.options.isHeadless && this.editor.options.ydoc) {
      const cleanup = initHeadlessBinding(this.editor);
      registerHeadlessBindingCleanup(this.editor, cleanup);
    }
  },

  onDestroy() {
    const cleanup = collaborationCleanupByEditor.get(this.editor);
    if (!cleanup) return;

    cleanup.mediaMap.unobserve(cleanup.mediaMapObserver);
    cleanup.headerFooterMap.unobserve(cleanup.headerFooterMapObserver);
    cleanup.stylesMap.unobserve(cleanup.stylesMapObserver);
    cleanup.ooxmlPartsMap.unobserve(cleanup.ooxmlPartsMapObserver);
    this.editor.off('partChanged', cleanup.handlePartChanged);

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
    initializeCollaborationRoom(ydoc, editor);
  };

  return [ySyncPlugin(fragment, { onFirstRender }), fragment];
};

/**
 * First-client room initialization: seed bootstrap content and media map.
 *
 * Called once when the first client creates a new collaboration room.
 * Bootstrap content is immutable — subsequent changes flow through
 * structured channels, not through the bootstrap map.
 */
export const initializeCollaborationRoom = (ydoc, editor) => {
  writeBootstrapContent(ydoc, editor.options.content, {
    fonts: editor.options.fonts,
    user: editor.options.user,
  });

  const mediaMap = ydoc.getMap('media');
  Object.entries(editor.options.mediaFiles).forEach(([key, value]) => {
    mediaMap.set(key, value);
  });
};

// ---------------------------------------------------------------------------
// Transaction listener: schedule reconcile on local non-sync transactions
// ---------------------------------------------------------------------------

/**
 * Returns true if this transaction originates from the part-sync engine
 * (publish, bootstrap, reconcile) and should NOT re-trigger the reconcile
 * scheduler.
 */
const isPartSyncTransaction = (transaction) => {
  const event = transaction.origin?.event;
  return (
    typeof event === 'string' &&
    (event.endsWith('-publish') ||
      event === 'bootstrap-seed' ||
      event === 'legacy-bootstrap-migration' ||
      event === 'header-footer-update' ||
      event === 'styles-update')
  );
};

const initDocumentListener = ({ ydoc, editor }) => {
  const afterTransactionHandler = (transaction) => {
    if (!transaction.local) return;
    if (isPartSyncTransaction(transaction)) return;
    if (!transaction.changed?.size) return;

    markDirty(editor);
    scheduleReconcile(editor, 'afterTransaction');
  };

  ydoc.on('afterTransaction', afterTransactionHandler);

  return () => {
    ydoc.off('afterTransaction', afterTransactionHandler);
    destroyReconcileState(editor);
  };
};

// ---------------------------------------------------------------------------
// Provider sync listener
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Collaboration data generation (for programmatic room creation)
// ---------------------------------------------------------------------------

export const generateCollaborationData = async (editor) => {
  const ydoc = prosemirrorToYDoc(editor.state.doc, 'supereditor');

  // Export current DOCX state so bootstrap captures latest content,
  // not the originally loaded editor.options.content.
  const updatedDocs = await editor.exportDocx({ getUpdatedDocs: true });

  let content = Array.isArray(editor.options.content) ? [...editor.options.content] : [];
  if (updatedDocs && typeof updatedDocs === 'object') {
    for (const [name, xml] of Object.entries(updatedDocs)) {
      const idx = content.findIndex((item) => item.name === name);
      if (xml != null) {
        if (idx > -1) {
          content[idx] = { name, content: xml };
        } else {
          content.push({ name, content: xml });
        }
      } else if (idx > -1) {
        // null value means the file was deleted during export
        content.splice(idx, 1);
      }
    }
  }

  writeBootstrapContent(ydoc, content, {
    fonts: editor.options.fonts,
    user: editor.options.user,
  });

  const mediaMap = ydoc.getMap('media');
  Object.entries(editor.options.mediaFiles || {}).forEach(([key, value]) => {
    mediaMap.set(key, value);
  });

  return encodeStateAsUpdate(ydoc);
};

// ---------------------------------------------------------------------------
// Headless binding (unchanged from original)
// ---------------------------------------------------------------------------

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

  const headlessViewShim = {
    get state() {
      return editor.state;
    },
    dispatch: (tr) => {
      editor.dispatch(tr);
    },
    hasFocus: () => false,
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

    if (typeof binding._forceRerender === 'function') {
      binding._forceRerender();
    }

    if (editor.options.isNewFile) {
      initializeCollaborationRoom(editor.options.ydoc, editor);
    }

    state.binding = binding;
    return binding;
  };

  const transactionHandler = ({ transaction }) => {
    if (!editor.options.ydoc) return;

    const meta = transaction.getMeta(ySyncPluginKey);
    if (meta?.isChangeOrigin) return;

    const binding = ensureInitializedBinding();
    if (!binding) return;

    if (typeof binding._prosemirrorChanged !== 'function') return;
    const addToHistory = transaction.getMeta('addToHistory') !== false;

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

  state.cleanup = () => {
    editor.off('transaction', transactionHandler);
    if (headlessBindingStateByEditor.get(editor) === state) {
      headlessBindingStateByEditor.delete(editor);
    }
    headlessCleanupRegisteredEditors.delete(editor);
  };
  return state.cleanup;
};
