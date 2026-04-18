import { ref, computed, markRaw, watch } from 'vue';

/** @typedef {import('../core/types').FindReplaceConfig} FindReplaceConfig */
/** @typedef {import('../core/types').ResolvedFindReplaceTexts} ResolvedFindReplaceTexts */
/** @typedef {import('../core/types').FindReplaceHandle} FindReplaceHandle */
/** @typedef {import('../core/types').FindReplaceContext} FindReplaceContext */
/** @typedef {import('../core/types').FindReplaceResolution} FindReplaceResolution */

/** @type {ResolvedFindReplaceTexts} */
const DEFAULT_TEXTS = {
  findPlaceholder: 'Find',
  findAriaLabel: 'Find text',
  replacePlaceholder: 'Replace',
  replaceAriaLabel: 'Replace text',
  noResultsLabel: 'No results',
  previousMatchLabel: 'Previous match (Shift+Enter)',
  previousMatchAriaLabel: 'Previous match',
  nextMatchLabel: 'Next match (Enter)',
  nextMatchAriaLabel: 'Next match',
  closeLabel: 'Close (Escape)',
  closeAriaLabel: 'Close find and replace',
  replaceLabel: 'Replace',
  replaceAllLabel: 'All',
  toggleReplaceLabel: 'Toggle replace',
  toggleReplaceAriaLabel: 'Toggle replace',
  matchCaseLabel: 'Aa',
  matchCaseAriaLabel: 'Match case',
  ignoreDiacriticsLabel: '\u00e4\u2261a',
  ignoreDiacriticsAriaLabel: 'Ignore diacritics',
};

/**
 * Resolve the Search extension storage from the editor.
 * The storage is keyed by extension name in editor.extensionStorage;
 * we find it by looking for the object with our known storage shape.
 */
function getSearchStorage(editor) {
  if (!editor) return null;

  // Try direct access by common name first
  const byName = editor.extensionStorage?.Search ?? editor.storage?.Search;
  if (byName?.searchIndex || byName?.searchResults) return byName;

  // Fall back to scanning extensionStorage for the Search extension's storage
  const store = editor.extensionStorage ?? editor.storage;
  if (store) {
    for (const key of Object.keys(store)) {
      const val = store[key];
      if (val && typeof val === 'object' && 'searchIndex' in val && 'searchResults' in val) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Composable that manages a find/replace floating surface.
 *
 * Owns all search state (query, toggles, match count, active index) and the
 * resolution chain for custom/external/built-in rendering. The component
 * receives a FindReplaceHandle with reactive state and actions.
 *
 * @param {Object} options
 * @param {() => import('../core/surface-manager.js').SurfaceManager | null} options.getSurfaceManager
 * @param {() => import('@superdoc/super-editor').Editor | null} options.getActiveEditor
 * @param {import('vue').Ref} [options.activeEditorRef] - Reactive ref to the active editor (for watching switches)
 * @param {() => boolean | FindReplaceConfig | undefined} [options.getFindReplaceConfig] - Config getter
 */
export function useFindReplace({ getSurfaceManager, getActiveEditor, activeEditorRef, getFindReplaceConfig }) {
  // ---- internal state -------------------------------------------------------

  /** @type {import('../core/surface-manager.js').SurfaceHandle | null} */
  let currentSurfaceHandle = null;
  let currentEditor = null;
  let destroyed = false;
  let opening = false; // sync guard against double-open across the await gap

  const isOpen = ref(false);

  /** Ref to the find input element, set by the renderer via handle.registerFocusFn. */
  let focusFindInputFn = null;

  // ---- reactive state (owned by composable, consumed by renderers) ----------

  const findQuery = ref('');
  const replaceText = ref('');
  const caseSensitive = ref(false);
  const ignoreDiacritics = ref(false);
  const showReplace = ref(false);
  const matchCount = ref(0);
  const activeMatchIndex = ref(-1);

  /** Current resolved texts — updated on each open(). */
  let currentTexts = DEFAULT_TEXTS;

  const matchLabel = computed(() => {
    if (!findQuery.value) return '';
    if (matchCount.value === 0) return currentTexts.noResultsLabel;
    return `${activeMatchIndex.value + 1} of ${matchCount.value}`;
  });

  const hasMatches = computed(() => matchCount.value > 0);

  // ---- timers ---------------------------------------------------------------

  let debounceTimer = null;
  let syncInterval = null;

  // ---- search logic ---------------------------------------------------------

  function runSearch() {
    if (!currentEditor) return;
    if (!findQuery.value) {
      try {
        currentEditor.commands.clearSearchSession();
      } catch {
        /* destroyed */
      }
      matchCount.value = 0;
      activeMatchIndex.value = -1;
      return;
    }

    try {
      const result = currentEditor.commands.setSearchSession(findQuery.value, {
        caseSensitive: caseSensitive.value,
        ignoreDiacritics: ignoreDiacritics.value,
        highlight: true,
      });
      matchCount.value = result.matches.length;
      activeMatchIndex.value = result.activeMatchIndex;
    } catch {
      /* editor may be destroyed */
    }
  }

  function debouncedSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 150);
  }

  // Watchers run only when the surface is open (refs are reset on close).
  // They fire because open() calls resetState() which changes the ref values,
  // then user input changes them further.
  watch(findQuery, () => {
    if (isOpen.value) debouncedSearch();
  });
  watch(caseSensitive, () => {
    if (isOpen.value) runSearch();
  });
  watch(ignoreDiacritics, () => {
    if (isOpen.value) runSearch();
  });

  // ---- actions --------------------------------------------------------------

  let currentReplaceEnabled = true;

  function goNext() {
    if (!hasMatches.value || !currentEditor) return;
    try {
      const result = currentEditor.commands.nextSearchMatch();
      activeMatchIndex.value = result.activeMatchIndex;
    } catch {
      /* destroyed */
    }
  }

  function goPrev() {
    if (!hasMatches.value || !currentEditor) return;
    try {
      const result = currentEditor.commands.previousSearchMatch();
      activeMatchIndex.value = result.activeMatchIndex;
    } catch {
      /* destroyed */
    }
  }

  function replaceCurrent() {
    if (!currentReplaceEnabled) return;
    if (!hasMatches.value || !currentEditor) return;
    try {
      const result = currentEditor.commands.replaceSearchMatch(replaceText.value);
      matchCount.value = result.matches.length;
      activeMatchIndex.value = result.activeMatchIndex;
    } catch {
      /* destroyed */
    }
  }

  function replaceAll() {
    if (!currentReplaceEnabled) return;
    if (!hasMatches.value || !currentEditor) return;
    try {
      currentEditor.commands.replaceAllSearchMatches(replaceText.value);
      matchCount.value = 0;
      activeMatchIndex.value = -1;
    } catch {
      /* destroyed */
    }
  }

  // ---- polling --------------------------------------------------------------

  function syncFromEditorStorage() {
    const storage = getSearchStorage(currentEditor);
    if (!storage) return;

    const results = storage.searchResults;
    const count = Array.isArray(results) ? results.length : 0;
    const idx = storage.activeMatchIndex ?? -1;

    if (count !== matchCount.value) matchCount.value = count;
    if (idx !== activeMatchIndex.value) activeMatchIndex.value = idx;
  }

  function startPolling() {
    stopPolling();
    syncInterval = setInterval(syncFromEditorStorage, 200);
  }

  function stopPolling() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    clearInterval(syncInterval);
    syncInterval = null;
  }

  // ---- state reset ----------------------------------------------------------

  function resetState() {
    findQuery.value = '';
    replaceText.value = '';
    caseSensitive.value = false;
    ignoreDiacritics.value = false;
    showReplace.value = false;
    matchCount.value = 0;
    activeMatchIndex.value = -1;
  }

  // ---- config resolution ----------------------------------------------------

  /**
   * Normalise `getFindReplaceConfig()` into a full config with defaults.
   * Throws on invalid combinations (component + render).
   */
  function resolveConfig() {
    const raw = typeof getFindReplaceConfig === 'function' ? getFindReplaceConfig() : undefined;

    if (raw === false || raw == null) {
      return { enabled: false, texts: DEFAULT_TEXTS, replaceEnabled: true };
    }

    if (raw === true) {
      return { enabled: true, texts: DEFAULT_TEXTS, replaceEnabled: true };
    }

    const cfg = typeof raw === 'object' ? raw : {};

    if (cfg.component != null && typeof cfg.render === 'function') {
      throw new Error(
        'modules.surfaces.findReplace cannot provide both "component" and "render". Use one or the other.',
      );
    }

    /** @type {ResolvedFindReplaceTexts} */
    const texts = {
      findPlaceholder: cfg.findPlaceholder ?? DEFAULT_TEXTS.findPlaceholder,
      findAriaLabel: cfg.findAriaLabel ?? DEFAULT_TEXTS.findAriaLabel,
      replacePlaceholder: cfg.replacePlaceholder ?? DEFAULT_TEXTS.replacePlaceholder,
      replaceAriaLabel: cfg.replaceAriaLabel ?? DEFAULT_TEXTS.replaceAriaLabel,
      noResultsLabel: cfg.noResultsLabel ?? DEFAULT_TEXTS.noResultsLabel,
      previousMatchLabel: cfg.previousMatchLabel ?? DEFAULT_TEXTS.previousMatchLabel,
      previousMatchAriaLabel: cfg.previousMatchAriaLabel ?? DEFAULT_TEXTS.previousMatchAriaLabel,
      nextMatchLabel: cfg.nextMatchLabel ?? DEFAULT_TEXTS.nextMatchLabel,
      nextMatchAriaLabel: cfg.nextMatchAriaLabel ?? DEFAULT_TEXTS.nextMatchAriaLabel,
      closeLabel: cfg.closeLabel ?? DEFAULT_TEXTS.closeLabel,
      closeAriaLabel: cfg.closeAriaLabel ?? DEFAULT_TEXTS.closeAriaLabel,
      replaceLabel: cfg.replaceLabel ?? DEFAULT_TEXTS.replaceLabel,
      replaceAllLabel: cfg.replaceAllLabel ?? DEFAULT_TEXTS.replaceAllLabel,
      toggleReplaceLabel: cfg.toggleReplaceLabel ?? DEFAULT_TEXTS.toggleReplaceLabel,
      toggleReplaceAriaLabel: cfg.toggleReplaceAriaLabel ?? DEFAULT_TEXTS.toggleReplaceAriaLabel,
      matchCaseLabel: cfg.matchCaseLabel ?? DEFAULT_TEXTS.matchCaseLabel,
      matchCaseAriaLabel: cfg.matchCaseAriaLabel ?? DEFAULT_TEXTS.matchCaseAriaLabel,
      ignoreDiacriticsLabel: cfg.ignoreDiacriticsLabel ?? DEFAULT_TEXTS.ignoreDiacriticsLabel,
      ignoreDiacriticsAriaLabel: cfg.ignoreDiacriticsAriaLabel ?? DEFAULT_TEXTS.ignoreDiacriticsAriaLabel,
    };

    return {
      enabled: true,
      texts,
      replaceEnabled: cfg.replaceEnabled ?? true,
      component: cfg.component,
      props: cfg.props,
      render: cfg.render,
      resolver: cfg.resolver,
    };
  }

  /**
   * Walk the 3-tier resolution chain:
   * 1. Dedicated findReplace.resolver
   * 2. Direct findReplace.component / findReplace.render
   * 3. Built-in FindReplaceSurface
   *
   * @param {ReturnType<typeof resolveConfig>} config
   * @param {FindReplaceContext} resolverCtx
   * @returns {{ suppressed?: boolean, component?: unknown, props?: Record<string, unknown>, render?: Function, builtin?: boolean }}
   */
  function resolveRendering(config, resolverCtx) {
    // Tier 1: dedicated resolver
    if (typeof config.resolver === 'function') {
      const resolution = config.resolver(resolverCtx);

      if (resolution != null && resolution.type !== 'default') {
        if (resolution.type === 'none') return { suppressed: true };
        if (resolution.type === 'custom') return { component: resolution.component, props: resolution.props };
        if (resolution.type === 'external') return { render: resolution.render };
      }
      // null / undefined / { type: 'default' } → fall through
    }

    // Tier 2: direct component/render from config
    if (config.component != null) return { component: config.component, props: config.props };
    if (typeof config.render === 'function') return { render: config.render };

    // Tier 3: built-in
    return { builtin: true };
  }

  // ---- handle ---------------------------------------------------------------

  /**
   * Build a FindReplaceHandle from reactive state + actions + config.
   * @param {ReturnType<typeof resolveConfig>} config
   * @param {(reason?: unknown) => void} closeFn Late-wired close function
   * @returns {FindReplaceHandle}
   */
  function createHandle(config, closeFn) {
    return {
      // Reactive state
      findQuery,
      replaceText,
      caseSensitive,
      ignoreDiacritics,
      showReplace,
      matchCount,
      activeMatchIndex,
      matchLabel,
      hasMatches,
      // Metadata
      replaceEnabled: config.replaceEnabled ?? true,
      texts: config.texts,
      // Actions
      goNext,
      goPrev,
      replaceCurrent,
      replaceAll,
      registerFocusFn: (fn) => {
        focusFindInputFn = fn;
      },
      close: (reason) => closeFn(reason),
    };
  }

  /**
   * Wrap a FindReplaceHandle for external (non-Vue) renderers.
   * Converts Vue refs to JavaScript getter/setter properties.
   */
  function wrapHandleForExternal(handle) {
    return {
      get findQuery() {
        return handle.findQuery.value;
      },
      set findQuery(v) {
        handle.findQuery.value = v;
      },
      get replaceText() {
        return handle.replaceText.value;
      },
      set replaceText(v) {
        handle.replaceText.value = v;
      },
      get caseSensitive() {
        return handle.caseSensitive.value;
      },
      set caseSensitive(v) {
        handle.caseSensitive.value = v;
      },
      get ignoreDiacritics() {
        return handle.ignoreDiacritics.value;
      },
      set ignoreDiacritics(v) {
        handle.ignoreDiacritics.value = v;
      },
      get showReplace() {
        return handle.showReplace.value;
      },
      set showReplace(v) {
        handle.showReplace.value = v;
      },
      get matchCount() {
        return handle.matchCount.value;
      },
      get activeMatchIndex() {
        return handle.activeMatchIndex.value;
      },
      get matchLabel() {
        return handle.matchLabel.value;
      },
      get hasMatches() {
        return handle.hasMatches.value;
      },
      replaceEnabled: handle.replaceEnabled,
      texts: handle.texts,
      goNext: handle.goNext,
      goPrev: handle.goPrev,
      replaceCurrent: handle.replaceCurrent,
      replaceAll: handle.replaceAll,
      registerFocusFn: handle.registerFocusFn,
      close: handle.close,
    };
  }

  // ---- public API -----------------------------------------------------------

  /**
   * Clear the search session on the given editor, swallowing errors
   * (the editor may already be destroyed).
   */
  function clearEditorSession(editor) {
    if (!editor) return;
    try {
      editor.commands.clearSearchSession();
    } catch {
      /* destroyed */
    }
  }

  /**
   * Synchronous check: would open() produce a surface?
   * Used by the shortcut handler to decide whether to call preventDefault().
   * Never throws — a bad config or throwing resolver returns false so the
   * browser's native Cmd+F takes over instead of breaking keyboard handling.
   */
  function wouldOpen() {
    try {
      if (destroyed) return false;
      if (!getSurfaceManager()) return false;
      if (!getActiveEditor()) return false;

      // If already open, wouldOpen returns true (it will refocus)
      if (currentSurfaceHandle && isOpen.value) return true;

      const config = resolveConfig();
      if (!config.enabled) return false;

      const resolverCtx = { texts: config.texts, replaceEnabled: config.replaceEnabled ?? true };
      const resolution = resolveRendering(config, resolverCtx);
      return !resolution.suppressed;
    } catch {
      // Bad config (component + render) or throwing resolver — fall back to
      // browser default so the shortcut handler doesn't swallow Cmd+F.
      return false;
    }
  }

  /**
   * Open the find/replace surface, or refocus it if already open.
   */
  async function open() {
    if (destroyed) return;

    const manager = getSurfaceManager();
    if (!manager) return;

    // If already open, refocus the find input and return
    if (currentSurfaceHandle && isOpen.value) {
      focusFindInputFn?.();
      return;
    }

    // Sync guard that covers the await gap
    if (opening) return;
    opening = true;

    try {
      const editor = getActiveEditor();
      if (!editor) {
        opening = false;
        return;
      }

      const config = resolveConfig();
      if (!config.enabled) {
        opening = false;
        return;
      }

      const resolverCtx = { texts: config.texts, replaceEnabled: config.replaceEnabled ?? true };
      const resolution = resolveRendering(config, resolverCtx);

      if (resolution.suppressed) {
        opening = false;
        return;
      }

      // Reset reactive state for a new session
      resetState();
      currentTexts = config.texts;
      currentReplaceEnabled = config.replaceEnabled ?? true;

      // If there was a previous editor with an open search session, clear it
      if (currentEditor && currentEditor !== editor) {
        clearEditorSession(currentEditor);
      }
      currentEditor = editor;
      focusFindInputFn = null;

      // Late-wired close — the handle is created before the surface opens
      let lateCloseFn = () => {};

      const handle = createHandle(config, (reason) => lateCloseFn(reason));

      let surfaceHandle;

      if (resolution.component) {
        // Custom Vue component (from resolver or direct config)
        surfaceHandle = manager.open({
          mode: 'floating',
          ariaLabel: config.texts.findAriaLabel,
          floating: { placement: 'top-right', closeOnEscape: true, autoFocus: true },
          component: markRaw(resolution.component),
          props: { ...resolution.props, findReplace: handle },
        });
      } else if (resolution.render) {
        // External renderer (from resolver or direct config)
        const userRender = resolution.render;
        surfaceHandle = manager.open({
          mode: 'floating',
          ariaLabel: config.texts.findAriaLabel,
          floating: { placement: 'top-right', closeOnEscape: true, autoFocus: true },
          render: (ctx) =>
            userRender({
              container: ctx.container,
              findReplace: wrapHandleForExternal(handle),
              resolve: ctx.resolve,
              close: ctx.close,
              surfaceId: ctx.surfaceId,
              mode: ctx.mode,
            }),
        });
      } else {
        // Built-in — lazy import
        let FindReplaceSurface;
        try {
          ({ default: FindReplaceSurface } = await import('../components/surfaces/FindReplaceSurface.vue'));
        } catch {
          opening = false;
          return;
        }

        // Re-check after the await — state may have changed while we were loading
        if (destroyed || (currentSurfaceHandle && isOpen.value)) {
          opening = false;
          return;
        }

        // Re-read the active editor in case it changed during the import
        const freshEditor = getActiveEditor() || editor;
        if (currentEditor !== freshEditor) {
          clearEditorSession(currentEditor);
          currentEditor = freshEditor;
        }

        surfaceHandle = manager.open({
          mode: 'floating',
          ariaLabel: config.texts.findAriaLabel,
          component: markRaw(FindReplaceSurface),
          floating: { placement: 'top-right', closeOnEscape: true, autoFocus: true },
          props: { findReplace: handle },
        });
      }

      // Wire late close
      lateCloseFn = (reason) => surfaceHandle.close(reason ?? 'programmatic');
      currentSurfaceHandle = surfaceHandle;
      isOpen.value = true;
      opening = false;

      // Start polling editor storage for external changes
      startPolling();

      // Capture handle ID for stale-settle detection
      const handleId = surfaceHandle.id;

      surfaceHandle.result.then(() => {
        if (currentSurfaceHandle?.id === handleId) {
          stopPolling();
          clearEditorSession(currentEditor);
          currentSurfaceHandle = null;
          isOpen.value = false;
          focusFindInputFn = null;
        } else {
          // A newer open() already took over; just clean up our editor's
          // session if it's a different editor than the one now active.
          clearEditorSession(editor !== currentEditor ? editor : null);
        }
      });
    } catch (err) {
      // Ensure the sync guard is always released so a bad config or
      // throwing resolver doesn't permanently block future opens.
      opening = false;
      throw err;
    }
  }

  /**
   * Close the find/replace surface and clear search state.
   */
  function close() {
    if (currentSurfaceHandle) {
      currentSurfaceHandle.close('programmatic');
    }
  }

  // Watch for active editor changes — clear previous editor's search and close surface
  if (activeEditorRef) {
    watch(activeEditorRef, (newEditor, oldEditor) => {
      if (!isOpen.value || !currentSurfaceHandle) return;
      if (newEditor === oldEditor) return;

      clearEditorSession(oldEditor);
      close();
    });
  }

  /**
   * Tear down the composable. Call from onBeforeUnmount.
   */
  function destroy() {
    destroyed = true;
    stopPolling();
    close();
    currentEditor = null;
    focusFindInputFn = null;
  }

  return {
    open,
    close,
    isOpen,
    wouldOpen,
    destroy,
  };
}
