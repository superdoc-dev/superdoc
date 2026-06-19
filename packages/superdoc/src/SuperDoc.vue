<script setup>
import '@superdoc/common/styles/common-styles.css';
// In the monorepo dev app, consume the editor stylesheet from source so local
// CSS edits take effect immediately instead of depending on a rebuilt dist CSS.
import '../../super-editor/src/style.css';

import { superdocIcons } from './icons.js';
//prettier-ignore
import {
  getCurrentInstance,
  inject,
  ref,
  shallowRef,
  unref,
  onMounted,
  onBeforeUnmount,
  nextTick,
  computed,
  reactive,
  watch,
  defineAsyncComponent,
  markRaw,
} from 'vue';
import { storeToRefs } from 'pinia';

import CommentsLayer from './components/CommentsLayer/CommentsLayer.vue';
import CommentDialog from '@superdoc/components/CommentsLayer/CommentDialog.vue';
import FloatingComments from '@superdoc/components/CommentsLayer/FloatingComments.vue';
import HrbrFieldsLayer from '@superdoc/components/HrbrFieldsLayer/HrbrFieldsLayer.vue';
import WhiteboardLayer from './components/Whiteboard/WhiteboardLayer.vue';
import { useWhiteboard } from './components/Whiteboard/use-whiteboard';
import useSelection from '@superdoc/helpers/use-selection';

import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import { useCommentsStore } from '@superdoc/stores/comments-store';

import { DOCX, PDF, HTML } from '@superdoc/common';
import { composeAuthorColorResolver } from '@superdoc/contracts';
import {
  SuperEditor,
  AIWriter,
  PresentationEditor,
  getTrackedChangeIndex,
  TrackChangesBasePluginKey,
} from '@superdoc/super-editor';
import { ySyncPluginKey } from 'y-prosemirror';
import HtmlViewer from './components/HtmlViewer/HtmlViewer.vue';
import useComment from './components/CommentsLayer/use-comment';
import AiLayer from './components/AiLayer/AiLayer.vue';
import { useSelectedText } from './composables/use-selected-text';
import { useAi } from './composables/use-ai';
import { useHighContrastMode } from './composables/use-high-contrast-mode';
import { useCommentSmallScreen } from './composables/use-comment-small-screen.js';
import { useCompactCommentPopover } from './composables/use-compact-comment-popover.js';
import { getVisibleThreadAnchorClientY } from './helpers/comment-focus.js';
import { useUiFontFamily } from './composables/useUiFontFamily.js';
import { usePasswordPrompt } from './composables/use-password-prompt.js';
import { useFindReplace } from './composables/use-find-replace.js';
import { useViewportFit } from './composables/use-viewport-fit.js';
import { createV1EditorRuntimeAdapter } from './core/editor-runtime/v1/v1-editor-runtime-adapter.js';
import { markRuntimeRoot, unmarkRuntimeRoot } from './core/editor-runtime/root-marker.js';
import { collectTouchedTrackedChangeIds } from './helpers/collect-touched-tracked-change-ids.js';
import { resolveV2Integration } from './core/v2-integration/v2-integration.js';
import { transactionTouchesStructuralChange } from './helpers/transaction-touches-structural-change.js';
import SurfaceHost from './components/surfaces/SurfaceHost.vue';
import {
  DEFAULT_COMMENTS_DISPLAY_MODE,
  RIGHT_CLICK_COMMENT_SUPPRESS_MS,
  VALID_COMMENTS_DISPLAY_MODES,
} from './helpers/comment-small-screen.js';

const PdfViewer = defineAsyncComponent(() => import('./components/PdfViewer/PdfViewer.vue'));
const getDocumentLoadPassword = (doc) => doc.password ?? proxy.$superdoc.config.password;

// Stores
const superdocStore = useSuperdocStore();
const commentsStore = useCommentsStore();
const emit = defineEmits(['selection-update']);

//prettier-ignore
const {
  documents,
  isReady,
  areDocumentsReady,
  selectionPosition,
  activeSelection,
  activeZoom,
  zoomMode,
  viewportMetrics,
} = storeToRefs(superdocStore);
const { handlePageReady, modules, user, getDocument } = superdocStore;

// Password prompt coordinator — uses surfaces to show a dialog for encrypted DOCX files.
const surfaceManager = inject('surfaceManager', null);
const passwordPrompt = usePasswordPrompt({
  getSurfaceManager: () => surfaceManager,
  getPasswordPromptConfig: () => proxy.$superdoc?.config?.modules?.surfaces?.passwordPrompt,
  onUnhandled: (doc, errorCode, originalException) => {
    // The password prompt initially claimed this error but could not show a dialog
    // (resolver returned { type: 'none' }, config was invalid, or resolver threw).
    // Re-emit the original exception event so the app can handle it.
    proxy.$superdoc?.emit('exception', {
      error: originalException?.error ?? new Error(`Password prompt unhandled: ${errorCode}`),
      editor: originalException?.editor ?? null,
      code: errorCode,
      documentId: doc?.id,
    });
  },
});

/*
NOTE: new PdfViewer does not emit page-loaded. Hrbr fields/annotations
rely on handlePageReady; revisit when wiring fields for PDF.

From the old code:
const containerBounds = container.getBoundingClientRect();
containerBounds.originalWidth = width;
containerBounds.originalHeight = height;
emit('page-loaded', documentId, index, containerBounds);
*/

//prettier-ignore
const {
  getConfig,
  documentsWithConverations,
  commentsList,
  pendingComment,
  activeComment,
  skipSelectionUpdate,
  commentsByDocument,
  isCommentsListVisible,
  isFloatingCommentsReady,
  generalCommentIds,
  hasSyncedCollaborationComments,
  editorCommentPositions,
  hasInitializedLocations,
  isCommentHighlighted,
} = storeToRefs(commentsStore);
const {
  showAddComment,
  handleEditorLocationsUpdate,
  handleTrackedChangeUpdate,
  refreshTrackedChangeCommentsByIds,
  syncTrackedChangePositionsWithDocument,
  syncTrackedChangeComments,
  addComment,
  getComment,
  resolveCommentPositionEntry,
  belongsToDocument,
  COMMENT_EVENTS,
  requestInstantSidebarAlignment,
  peekInstantSidebarAlignment,
  clearInstantSidebarAlignment,
} = commentsStore;
const { proxy } = getCurrentInstance();
commentsStore.proxy = proxy;

// Resolve the V2 integration seam from config. Public SuperDoc does not bundle
// a V2 runtime: the host injects a single integration object
// (`config.editorIntegration`), and a local stub preserves V1
// behavior when none is provided. The V2 editor / ruler components and the
// geometry + review hydration factories all arrive through this object.
const resolvedEditorIntegration = resolveV2Integration(proxy.$superdoc.config);
// ui-phase2-001: the v2 DOCX editor wrapper now comes from the injected
// integration, so the v1 default bundle never references the V2 host runtime.
const V2SuperEditor = markRaw(resolvedEditorIntegration.EditorComponent);
// ui-phase4-002: v2 ruler (optional). Falls back to the stub editor component's
// sibling null when the integration does not provide one.
const V2Ruler = resolvedEditorIntegration.RulerComponent ? markRaw(resolvedEditorIntegration.RulerComponent) : null;

const floatingComments = computed(() => {
  const currentFloatingComments = unref(commentsStore.getFloatingComments);
  return Array.isArray(currentFloatingComments) ? currentFloatingComments : [];
});

const { isHighContrastMode } = useHighContrastMode();
const { uiFontFamily } = useUiFontFamily();

const isViewingMode = () => proxy?.$superdoc?.config?.documentMode === 'viewing';
const allowSelectionInViewMode = () => !!proxy?.$superdoc?.config?.allowSelectionInViewMode;
const isViewingCommentsVisible = computed(
  () => isViewingMode() && proxy?.$superdoc?.config?.comments?.visible === true,
);
const isFindReplaceEnabled = computed(() => {
  const val = proxy?.$superdoc?.config?.modules?.surfaces?.findReplace;
  return val === true || (typeof val === 'object' && val !== null);
});
const isViewingTrackChangesVisible = computed(
  () => isViewingMode() && proxy?.$superdoc?.config?.trackChanges?.visible === true,
);
const shouldRenderCommentsInViewing = computed(() => {
  if (!isViewingMode()) return true;
  return isViewingCommentsVisible.value || isViewingTrackChangesVisible.value;
});

const resolvedProofingConfig = computed(() => {
  if (proxy.$superdoc.config.proofing !== undefined) {
    return proxy.$superdoc.config.proofing;
  }
  return proxy.$superdoc.config.layoutEngineOptions?.proofing;
});

const commentsModuleConfig = computed(() => {
  const config = modules.comments;
  if (config === false || config == null) return null;
  return config;
});

const superdocStyleVars = computed(() => {
  const vars = {
    '--sd-ui-font-family': uiFontFamily.value,
  };

  const commentsConfig = proxy.$superdoc.config.modules?.comments;
  if (!commentsConfig || commentsConfig === false) return vars;

  if (commentsConfig.highlightHoverColor) {
    vars['--sd-comments-highlight-hover'] = commentsConfig.highlightHoverColor;
  }

  const trackChangeColors = commentsConfig.trackChangeHighlightColors || {};
  const activeTrackChangeColors = {
    ...trackChangeColors,
    ...(commentsConfig.trackChangeActiveHighlightColors || {}),
  };
  if (activeTrackChangeColors.insertBorder)
    vars['--sd-tracked-changes-insert-border'] = activeTrackChangeColors.insertBorder;
  if (activeTrackChangeColors.insertBackground)
    vars['--sd-tracked-changes-insert-background'] = activeTrackChangeColors.insertBackground;
  if (activeTrackChangeColors.deleteBorder)
    vars['--sd-tracked-changes-delete-border'] = activeTrackChangeColors.deleteBorder;
  if (activeTrackChangeColors.deleteBackground)
    vars['--sd-tracked-changes-delete-background'] = activeTrackChangeColors.deleteBackground;
  if (activeTrackChangeColors.formatBorder)
    vars['--sd-tracked-changes-format-border'] = activeTrackChangeColors.formatBorder;

  return vars;
});

// Refs
const superdocRoot = ref(null);
const layers = ref(null);
const rightSidebarRef = ref(null);
const pdfViewerRef = ref(null);
const pendingReplayTrackedChangeSync = ref(false);
const toolsMenuPosition = reactive({ top: null, right: '-25px', zIndex: 101 });
const {
  superdocContainerWidth,
  isCompactCommentsMode,
  recalculateCompactCommentsMode,
  ensureCompactMeasurementObserver,
} = useCommentSmallScreen({
  commentsModuleConfig,
  superdocRoot,
  layers,
});

// ui-phase2-001: opt-in v2 DOCX editor mode. Normalized by `SuperDoc.#init`
// before this component mounts, so `editorVersion` is always `1` or `2` here.
// `1` (default) keeps the existing v1 SuperEditor DOCX path; `2` swaps DOCX
// documents to the v2 host shell wrapper (`V2SuperEditor`). PDF / HTML are
// always routed through their existing viewers regardless of the flag.
const isV2Mode = computed(() => proxy.$superdoc.config.editorVersion === 2);

// ui-phase3-001: v2 geometry bridge state. `v2GeometryRender` holds the
// latest payload reported by `V2SuperEditor` after each render-epoch change;
// `v2GeometryEpoch` is the last epoch we successfully published into the
// comments store so the RAF batcher can drop duplicate ticks. `v2Geometry-
// Available` flips true once we've published at least one geometry
// snapshot — it gates `showCommentsSidebar` in v2 mode so the sidebar does
// not appear before painted carriers exist.
const v2GeometryRender = shallowRef(null);
const v2GeometryAvailable = ref(false);
const v2GeometryEpoch = ref(null);
let v2GeometryRafHandle = 0;

// Create a ref to pass to the composable
const activeEditorRef = computed(() => proxy.$superdoc.activeEditor);

// Find/replace controller — uses surfaces to show a floating find/replace popover.
const findReplace = useFindReplace({
  getSurfaceManager: () => surfaceManager,
  getActiveEditor: () => proxy.$superdoc?.activeEditor,
  activeEditorRef,
  getFindReplaceConfig: () => proxy.$superdoc?.config?.modules?.surfaces?.findReplace,
});

// Use the active runtime for selected text when available; fall back to the
// legacy active editor during startup and in tests.
const { selectedText } = useSelectedText(activeEditorRef, {
  getActiveRuntime: () => proxy.$superdoc?.getActiveRuntime?.(),
});

// Use the AI composable
const {
  showAiLayer,
  showAiWriter,
  aiWriterPosition,
  aiLayer,
  initAiLayer,
  showAiWriterAtCursor,
  handleAiWriterClose,
  handleAiToolClick,
} = useAi({
  activeEditorRef,
});

const pdfConfig = proxy.$superdoc.config.modules?.pdf || {};

const flushPendingReplayTrackedChangeSync = () => {
  if (!pendingReplayTrackedChangeSync.value) return;
  pendingReplayTrackedChangeSync.value = false;
  syncTrackedChangeComments({ superdoc: proxy.$superdoc, editor: proxy.$superdoc?.activeEditor });
};

let queuedTrackedChangeCommentResync = null;
let isTrackedChangeCommentResyncQueued = false;

const flushQueuedTrackedChangeCommentResync = () => {
  isTrackedChangeCommentResyncQueued = false;

  const pendingResync = queuedTrackedChangeCommentResync;
  queuedTrackedChangeCommentResync = null;
  if (!pendingResync?.editor) return;

  if (pendingResync.fullResync) {
    syncTrackedChangeComments({
      superdoc: proxy.$superdoc,
      editor: pendingResync.editor,
      broadcastChanges: pendingResync.broadcastChanges,
    });
    return;
  }

  refreshTrackedChangeCommentsByIds({
    superdoc: proxy.$superdoc,
    editor: pendingResync.editor,
    changeIds: Array.from(pendingResync.changeIds ?? []),
    broadcastChanges: pendingResync.broadcastChanges,
  });
};

const queueTrackedChangeCommentResync = ({ editor, changeIds = null, broadcastChanges = true } = {}) => {
  if (!editor || (changeIds && !changeIds.size)) return;

  const existingChangeIds = queuedTrackedChangeCommentResync?.changeIds ?? new Set();
  queuedTrackedChangeCommentResync = {
    editor,
    fullResync: !changeIds || Boolean(queuedTrackedChangeCommentResync?.fullResync),
    changeIds: changeIds ? new Set([...existingChangeIds, ...changeIds]) : existingChangeIds,
    broadcastChanges: Boolean(queuedTrackedChangeCommentResync?.broadcastChanges) || Boolean(broadcastChanges),
  };

  if (isTrackedChangeCommentResyncQueued) return;
  isTrackedChangeCommentResyncQueued = true;
  queueMicrotask(flushQueuedTrackedChangeCommentResync);
};

const scheduleReplayTrackedChangeSync = () => {
  pendingReplayTrackedChangeSync.value = true;

  const activeDocId = proxy.$superdoc?.activeEditor?.options?.documentId;
  const hasPresentationBridge = Boolean(activeDocId && PresentationEditor.getInstance(activeDocId) && layers.value);

  // Always schedule a fallback flush. In layout mode, replay can remove the last
  // comment/tracked-change anchor, which means no commentPositions event is emitted.
  // Without this fallback, pending replay sync can stay stuck forever.
  nextTick(() => {
    flushPendingReplayTrackedChangeSync();
  });

  // In layout mode we still flush on comment-position updates when they arrive.
  // For non-layout/viewing-hidden cases, the nextTick fallback above is the primary path.
  if (!hasPresentationBridge || !shouldRenderCommentsInViewing.value) return;
};

const handleDocumentReady = (documentId, container) => {
  const doc = getDocument(documentId);
  doc.isReady = true;
  doc.container = container;
  if (areDocumentsReady.value) {
    if (!proxy.$superdoc.config.collaboration) isReady.value = true;
  }

  ensureInitialFallbackZoom();
  isFloatingCommentsReady.value = true;
  hasInitializedLocations.value = true;
  proxy.$superdoc.broadcastPdfDocumentReady();
};

const getPendingCommentTargetClientY = () => {
  if (!selectionPosition.value || !layers.value) return null;

  const isPdf = selectionPosition.value.source === 'pdf';
  const zoom = isPdf ? (activeZoom.value ?? 100) / 100 : 1;
  const top = Number(selectionPosition.value.top);
  if (!Number.isFinite(top)) return null;

  return layers.value.getBoundingClientRect().top + top * zoom;
};

const handleCommentToolClick = () => {
  const result = showAddComment(proxy.$superdoc, getPendingCommentTargetClientY());
  if (result?.ok === false) return;
  if (!isV2Mode.value) return;

  const pendingPosition = buildV2PendingPositionEntry();
  if (pendingPosition) publishV2PendingPositionEntry(pendingPosition);
};

const handleToolClick = (tool) => {
  const toolOptions = {
    comments: () => handleCommentToolClick(),
    ai: () => handleAiToolClick(),
  };

  if (tool in toolOptions) {
    toolOptions[tool](activeSelection.value, selectionPosition.value);
  }

  activeSelection.value = null;
  toolsMenuPosition.top = null;
};

const handleHighlightClick = () => (toolsMenuPosition.top = null);

const onCommentsLoaded = ({ editor, comments, replacedFile }) => {
  if (editor.options.shouldLoadComments || replacedFile) {
    nextTick(() => {
      commentsStore.processLoadedDocxComments({
        superdoc: proxy.$superdoc,
        editor,
        comments,
        documentId: editor.options.documentId,
        replacedFile,
      });
    });
  }
};

const onEditorBeforeCreate = ({ editor }) => {
  proxy.$superdoc?.broadcastEditorBeforeCreate(editor);
};

const onEditorContentControlFocus = (payload) => {
  proxy.$superdoc.emit('content-control:active-change', payload);
};

const onEditorContentControlBlur = (payload) => {
  proxy.$superdoc.emit('content-control:active-change', payload);
};

const onEditorContentControlClick = (payload) => {
  proxy.$superdoc.emit('content-control:click', payload);
};

// Shell-owned per-document state for the v1 runtime adapter.
const subDocumentRoots = new Map();
const v1Runtimes = new Map();
let v1RuntimeSeq = 0;

/**
 * Store the shell-owned wrapper for a document editor. This wrapper is outside
 * painter DOM and is the only element stamped with the runtime marker.
 * @param {Object} doc - the document model
 * @param {HTMLElement|null} el - the wrapper element, or null on unmount
 */
const setSubDocumentRoot = (doc, el) => {
  if (!doc?.id) return;
  if (el) subDocumentRoots.set(doc.id, el);
  else subDocumentRoots.delete(doc.id);
};

/**
 * Register a pending v1 runtime at editor creation. The visible
 * PresentationEditor is attached later from onEditorReady.
 * @param {string} documentId
 * @param {Object} editor - the live v1 Editor instance
 */
const registerV1Runtime = (documentId, editor) => {
  const root = subDocumentRoots.get(documentId);
  if (!root) {
    console.warn('[SuperDoc] v1 runtime host root unavailable; skipping runtime registration for', documentId);
    return;
  }

  const existing = v1Runtimes.get(documentId);
  if (existing) existing.adapter.runtime.dispose();

  const runtimeId = `v1:${documentId}:${++v1RuntimeSeq}`;
  const adapter = createV1EditorRuntimeAdapter({
    id: runtimeId,
    documentId,
    root,
    editor,
    setGlobalZoom: (factor) => PresentationEditor.setGlobalZoom(factor),
    onUnregister: (id) => {
      proxy.$superdoc.unregisterEditorRuntime(id);
      const current = v1Runtimes.get(documentId);
      if (current && current.runtimeId === id) v1Runtimes.delete(documentId);
      const hostRoot = subDocumentRoots.get(documentId);
      if (hostRoot) unmarkRuntimeRoot(hostRoot);
    },
  });

  markRuntimeRoot(root, runtimeId);
  proxy.$superdoc.registerEditorRuntime(adapter.runtime);
  v1Runtimes.set(documentId, { runtimeId, adapter });
  proxy.$superdoc.setActiveRuntime(runtimeId, 'v1-editor-create');
};

const onEditorCreate = ({ editor }) => {
  const { documentId } = editor.options;
  const doc = getDocument(documentId);
  doc.setEditor(editor);
  registerV1Runtime(documentId, editor);
  proxy.$superdoc.setActiveEditor(editor);
  editor.on?.('contentControlFocus', onEditorContentControlFocus);
  editor.on?.('contentControlBlur', onEditorContentControlBlur);
  editor.on?.('contentControlClick', onEditorContentControlClick);
  proxy.$superdoc.broadcastEditorCreate(editor);
  // Initialize the ai layer
  initAiLayer(true);
};

/**
 * Handle editor-ready event from SuperEditor
 * @param {Object} payload
 * @param {Editor} payload.editor - The Editor instance
 * @param {PresentationEditor} payload.presentationEditor - The PresentationEditor wrapper
 */
const onEditorReady = ({ editor, presentationEditor }) => {
  // Legacy (non-layout-engine) editors return early below; the seeded
  // initial zoom for their CSS-fallback transform must apply first.
  ensureInitialFallbackZoom();
  if (!presentationEditor) return;

  // Store presentationEditor reference for mode changes
  const { documentId } = editor.options;
  const doc = getDocument(documentId);
  if (doc) {
    // Notify the password prompt coordinator so a pending retry resolves.
    passwordPrompt.handleEditorReady(doc);

    doc.setPresentationEditor(presentationEditor);
    // Passwords are only needed during the initial encrypted-file load.
    // Clear the per-document copy once the editor is ready so the value does
    // not linger on the reactive document model.
    if (doc.password) doc.password = undefined;
  }

  const v1Runtime = v1Runtimes.get(documentId);
  if (v1Runtime) v1Runtime.adapter.attachPresentationEditor(presentationEditor);
  presentationEditor.setContextMenuDisabled?.(proxy.$superdoc.config.disableContextMenu);
  getTrackedChangeIndex(editor);

  // Listen for fresh comment positions from the layout engine.
  // PresentationEditor emits this after every layout with PM positions collected
  // from the current document, ensuring positions are never stale.
  presentationEditor.on('commentPositions', ({ positions }) => {
    const commentsConfig = proxy.$superdoc.config.modules?.comments;
    if (!commentsConfig || commentsConfig === false) return;
    if (!shouldRenderCommentsInViewing.value) {
      commentsStore.clearEditorCommentPositions?.();
      return;
    }

    // Map PM positions to visual layout coordinates
    const mappedPositions = presentationEditor.getCommentBounds(positions, layers.value);
    handleEditorLocationsUpdate(mappedPositions);
    flushPendingReplayTrackedChangeSync();

    // Ensure floating comments can render once the layout engine starts emitting positions.
    // For DOCX, handleDocumentReady doesn't fire (it's wired to PDFViewer), so this is
    // the primary trigger for hasInitializedLocations in editor-based documents.
    if (!hasInitializedLocations.value) {
      hasInitializedLocations.value = true;
    }
  });

  editor.on?.('tracked-changes-changed', ({ editor: sourceEditor, source }) => {
    if (source === 'body-edit') return;
    if (!shouldRenderCommentsInViewing.value) {
      commentsStore.clearEditorCommentPositions?.();
      return;
    }
    syncTrackedChangeComments({ superdoc: proxy.$superdoc, editor: sourceEditor ?? editor });
  });

  presentationEditor.on('paginationUpdate', ({ layout }) => {
    const totalPages = layout.pages.length;
    proxy.$superdoc.emit('pagination-update', { totalPages, superdoc: proxy.$superdoc });
  });

  presentationEditor.on('headerFooterUpdate', (payload = {}) => {
    proxy.$superdoc.emit('editor-update', buildEditorUpdatePayload(payload));
  });

  presentationEditor.on('headerFooterTransaction', (payload = {}) => {
    emitEditorTransaction(buildEditorTransactionPayload(payload));
  });
};

const onEditorDestroy = () => {
  proxy.$superdoc.broadcastEditorDestroy();
};

// ui-phase2-001: V2 ready / failure handlers. These DO NOT impersonate the v1
// `Editor` / `PresentationEditor` surface. Instead, the shell publishes a
// small v2 facade on `proxy.$superdoc.activeEditor` so existing read-only
// access patterns (`activeEditor.options.documentId`) keep working while
// v1-only methods (`commands`, `state`, `view`, `chain`, `can`) are absent by
// design. Visible shell chrome that previously called those v1-only methods
// is gated by `isV2Mode` and the editorVersion=2 capability surface.
// Readiness-driven v2 review-row hydration. Replaces the former fixed 2s
// `setTimeout`/`requestIdleCallback` startup gate: startup comment and
// tracked-change rows hydrate as soon as the first source-backed document
// window has painted (v2 render-readiness `first-window-painted`), with
// generation-scoped cancellation and in-flight coalescing. Rows and geometry
// stay separate — this controller never reads or waits on the geometry
// publisher. The concrete controller arrives through the injected V2
// integration.
const v2ReviewHydrationController = resolvedEditorIntegration.createReviewHydrationController({
  hydrateComments: (ctx) => commentsStore.hydrateCommentsFromV2?.(ctx),
  hydrateTrackedChanges: (ctx) => commentsStore.hydrateTrackedChangesFromV2?.(ctx),
});

const buildEmptyV2SelectionInfo = () => ({
  empty: true,
  target: null,
  activeMarks: [],
  activeCommentIds: [],
  activeChangeIds: [],
});

const normalizeV2SelectionStory = (story) => {
  if (!story || story.storyType === 'body') {
    return undefined;
  }
  return story;
};

const readV2SelectionInfo = (host) => {
  const empty = buildEmptyV2SelectionInfo();
  try {
    const selection = host?.getHandles?.()?.editing?.selection?.getSnapshot?.();
    if (!selection?.anchor || !selection?.focus) {
      return empty;
    }

    const anchorBlockId = selection.anchor.blockId ?? null;
    const focusBlockId = selection.focus.blockId ?? null;
    const start = Math.min(selection.anchor.blockOffset ?? 0, selection.focus.blockOffset ?? 0);
    const end = Math.max(selection.anchor.blockOffset ?? 0, selection.focus.blockOffset ?? 0);
    const story = normalizeV2SelectionStory(selection.story);

    return {
      empty: start === end,
      target:
        anchorBlockId && anchorBlockId === focusBlockId
          ? {
              kind: 'text',
              segments: [{ blockId: anchorBlockId, range: { start, end } }],
              ...(story ? { story } : {}),
            }
          : null,
      activeMarks: [],
      activeCommentIds: [],
      activeChangeIds: [],
    };
  } catch {
    return empty;
  }
};

const clearActiveV2EditorFacade = (documentId = null) => {
  const activeEditor = proxy.$superdoc?.activeEditor;
  if (!activeEditor || activeEditor.editorVersion !== 2) return;

  const activeDocumentId = activeEditor.documentId ?? activeEditor.options?.documentId ?? null;
  if (documentId && activeDocumentId && activeDocumentId !== documentId) return;

  const doc = activeDocumentId ? getDocument(activeDocumentId) : null;
  if (doc) {
    doc.isReady = false;
    if (typeof doc.setEditor === 'function') doc.setEditor(null);
  }
  proxy.$superdoc.setActiveEditor(null);
};

const assertV2DocumentApiCanMutate = (operation) => {
  if (isViewingMode()) {
    throw new Error(`activeEditor.doc.${operation}: document is read-only.`);
  }
};

const guardV2DocumentApiMutation = (owner, method, operation) => {
  if (!owner || typeof owner[method] !== 'function') return owner?.[method];
  return (...args) => {
    assertV2DocumentApiCanMutate(operation);
    return owner[method](...args);
  };
};

const createGuardedV2DocumentApi = (documentApi) => {
  if (!documentApi) return null;
  const comments = documentApi.comments
    ? {
        ...documentApi.comments,
        create: guardV2DocumentApiMutation(documentApi.comments, 'create', 'comments.create'),
        patch: guardV2DocumentApiMutation(documentApi.comments, 'patch', 'comments.patch'),
        delete: guardV2DocumentApiMutation(documentApi.comments, 'delete', 'comments.delete'),
      }
    : undefined;
  const trackChanges = documentApi.trackChanges
    ? {
        ...documentApi.trackChanges,
        decide: guardV2DocumentApiMutation(documentApi.trackChanges, 'decide', 'trackChanges.decide'),
      }
    : undefined;
  const history = documentApi.history
    ? {
        ...documentApi.history,
        undo: guardV2DocumentApiMutation(documentApi.history, 'undo', 'history.undo'),
        redo: guardV2DocumentApiMutation(documentApi.history, 'redo', 'history.redo'),
      }
    : undefined;
  return {
    ...documentApi,
    ...(comments ? { comments } : {}),
    ...(trackChanges ? { trackChanges } : {}),
    ...(history ? { history } : {}),
  };
};

const onV2EditorReady = (payload) => {
  if (!payload) return;
  const {
    host,
    mount,
    documentId,
    capabilities,
    commentsAdapter,
    trackedChangesAdapter,
    documentApi,
    documentMutationReadiness,
    documentApiUnavailableReason,
    pageMetrics,
    pageLayout,
    pageFurniture,
  } = payload;
  const saveV2Bytes = async () => {
    if (!host || typeof host.save !== 'function') {
      throw new Error('v2-editor: save unavailable');
    }
    return host.save();
  };
  const exportV2Docx = async () => {
    const bytes = await saveV2Bytes();
    return new Blob([bytes], { type: DOCX });
  };
  const guardedDocumentApi = createGuardedV2DocumentApi(documentApi);
  const facade = {
    editorVersion: 2,
    documentId,
    host,
    mount,
    options: {
      documentId,
      documentMode: proxy.$superdoc.config.documentMode,
    },
    // Stable disabled / not-shipped status mirror — the host capability
    // snapshot is the source of truth; this is a convenience surface for the
    // shell so it does not have to re-read `host.getCapabilities()` on every
    // toolbar tick.
    capabilities: capabilities ?? host?.getCapabilities?.() ?? null,
    save: saveV2Bytes,
    exportDocx: exportV2Docx,
    // Mutation-plane consolidation: `activeEditor.doc` is the SuperDoc-facing
    // synchronous Document API mutation surface for normal inline v2. It is the
    // structural facade emitted by the v2 browser shell (backed by the private
    // raw inline `V2DocumentApiHost.doc`), so v2 comment / tracked-change /
    // history mutations route through `activeEditor.doc.*`. The live browser
    // `selection.current` read is preserved here rather than using the raw
    // headless selection adapter. In worker mode `documentApi` is null (no sync
    // Document API across the worker boundary) and only selection is exposed so
    // mutation UI fails closed.
    doc: guardedDocumentApi
      ? {
          ...guardedDocumentApi,
          selection: {
            current: () => readV2SelectionInfo(host),
          },
        }
      : {
          selection: {
            current: () => readV2SelectionInfo(host),
          },
        },
    // Visual readiness helper emitted beside the document facade. Callers that
    // need painted overlay/sidebar/geometry evidence await
    // `documentMutationReadiness.whenPainted(...)` after a committed receipt.
    documentMutationReadiness: documentMutationReadiness ?? null,
    // Stable reason when the synchronous Document API facade is unavailable
    // (worker-backed v2). Null when `doc.comments` / `doc.trackChanges` are live.
    documentApiUnavailableReason: documentApiUnavailableReason ?? null,
    focus: () => {
      if (mount?.focus && typeof mount.focus.focus === 'function') {
        return mount.focus.focus();
      }
      return false;
    },
    // ui-phase3-002: v2 comments adapter — used by comments-store and
    // CommentDialog to route create / reply / edit / resolve / delete through
    // v2 host APIs. Always present in v2 mode; null when the v2 editor host
    // boot failed.
    v2Comments: commentsAdapter ?? null,
    // ui-phase3-003: v2 tracked-change adapter — used by comments-store and
    // CommentDialog to list / focus / accept / reject tracked changes through
    // v2 host APIs. Always present in v2 mode; null when the v2 editor host
    // boot failed.
    v2TrackedChanges: trackedChangesAdapter ?? null,
    // ui-phase4-001: v2 page metrics + zoom runtime. Always present in v2
    // mode (null only if the v2 editor host boot failed). Consumers:
    //   - SuperDoc.vue's `activeZoom` watcher calls `pageMetrics.setZoom`
    //   - rulers, floating layers, whiteboard overlays consume
    //     `pageMetrics.getSnapshot()` / `subscribe(...)`.
    pageMetrics: pageMetrics ?? null,
    // ui-phase4-002: narrow v2 page-layout bridge for ruler / margin chrome.
    // Always present in v2 mode (null only if the v2 editor host boot failed).
    // Routes margin edits through `doc.sections.setPageMargins(...)` under
    // the hood; never exposes raw host/session/adapter handles to Vue.
    pageLayout: pageLayout ?? null,
    // Host-visible page-furniture geometry
    // readback. Always present in v2 mode (null only if the v2 editor host
    // boot failed). Host-visible proofs read
    // `superdoc.activeEditor.pageFurniture.getSnapshot()` to associate painted
    // header/footer regions with their story ref ids.
    pageFurniture: pageFurniture ?? null,
    // Readiness-driven review hydration diagnostics. Lets the example shell /
    // proofing layers observe startup row-hydration timing (boot → first-window
    // → first row) without reaching into Vue internals. Read-only surface.
    reviewHydration: {
      getDiagnostics: () => v2ReviewHydrationController.getDiagnostics(),
    },
    /**
     * The v2 active-editor facade explicitly does NOT carry v1 commands /
     * state / view / chain / can. Document mutations (comments, tracked
     * changes, history) go through `activeEditor.doc.*` — the synchronous
     * Document API facade above. Narrow read / focus / reveal / active-target
     * controls use their explicit bridge surfaces (`v2Comments` /
     * `v2TrackedChanges`); those are not review mutation routes. Chrome that
     * still uses the v1 surface must be gated behind
     * `superdoc.config.editorVersion === 1`.
     */
    commands: null,
    state: null,
    view: null,
  };

  const doc = getDocument(documentId);
  if (doc) {
    doc.isReady = true;
    if (typeof doc.setEditor === 'function') doc.setEditor(facade);
  }
  proxy.$superdoc.setActiveEditor(facade);
  proxy.$superdoc.broadcastEditorCreate(facade);
  if (getDocument(documentId)?.v2Collaboration) {
    onEditorCollaborationReady({ editor: facade });
  }
  // ui-phase4-002: flip the reactive readiness signal so the ruler template
  // re-evaluates `shouldShowV2Ruler(doc)` now that pageMetrics + pageLayout
  // are attached to the active editor facade.
  if (pageMetrics && pageLayout) v2RulerReady.value = true;

  // ui-phase3-002 / ui-phase3-003: register the v2 comment + tracked-change
  // adapters on the store so its adapter-identity guard
  // (`isCurrentV2TrackedChangesAdapter`) can drop stale async results, then
  // hand the readiness-driven hydration controller its context. Startup row
  // hydration is NOT fired on a fixed timer here: the controller triggers both
  // comment and tracked-change hydration as soon as the v2 render-readiness
  // lifecycle reports the first source-backed window painted. The geometry
  // bridge (Phase 3 / 001) keeps owning floating positions independently.
  const commentsModuleEnabled = proxy.$superdoc.config.modules?.comments !== false;
  if (commentsAdapter && commentsModuleEnabled) {
    commentsStore.setV2CommentsAdapter?.(commentsAdapter);
  }
  if (trackedChangesAdapter && commentsModuleEnabled) {
    commentsStore.setV2TrackedChangesAdapter?.(trackedChangesAdapter);
  }
  if (commentsModuleEnabled && (commentsAdapter || trackedChangesAdapter)) {
    v2ReviewHydrationController.setContext({
      superdoc: proxy.$superdoc,
      documentId,
      commentsAdapter: commentsAdapter ?? null,
      trackedChangesAdapter: trackedChangesAdapter ?? null,
    });
    // Feed the current readiness snapshot so a `first-window-painted` transition
    // that already happened during mount is not missed by a late subscriber.
    // Subsequent transitions arrive via `@v2-render-readiness` → onV2RenderReadiness.
    try {
      const snapshot = host?.getRenderReadinessSnapshot?.();
      if (snapshot) v2ReviewHydrationController.onRenderReadiness(snapshot);
    } catch (err) {
      console.warn('[SuperDoc][v2] initial render-readiness snapshot failed', err);
    }
  }

  if (areDocumentsReady.value && !proxy.$superdoc.config.collaboration) {
    isReady.value = true;
  }
  // Mark floating-comments fallback so the v2-mode shell does not idle on
  // the v1-only locations-update event.
  isFloatingCommentsReady.value = true;
  hasInitializedLocations.value = true;
};

// ui-phase3-002: v2 selection mirror used to gate the create-comment
// affordance in v2 mode. v1's `selectionPosition` is fed by PM coordsAtPos
// which v2 never emits, so we maintain a separate flag and feed the floating
// "+" tool from the v2 selection snapshot instead.
const v2HasRangeSelection = ref(false);
const v2SelectionSnapshot = shallowRef(null);
const onV2SelectionChanged = ({ hasRangeSelection, snapshot } = {}) => {
  v2HasRangeSelection.value = hasRangeSelection === true;
  v2SelectionSnapshot.value = hasRangeSelection === true ? (snapshot ?? null) : null;
  syncV2SelectionToolbarState();
};

const getActiveV2MountContainer = () => {
  return v2GeometryRender.value?.mountContainer ?? proxy.$superdoc?.activeEditor?.mount?.container ?? null;
};

const escapeCssIdent = (value) => {
  const raw = String(value);
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
};

const findV2SelectionAnchorElement = () => {
  const snapshot = v2SelectionSnapshot.value;
  const root = getActiveV2MountContainer();
  if (!snapshot || !root?.querySelector) return null;
  const anchor = snapshot.anchor ?? null;
  const ids = [anchor?.fragmentId, anchor?.blockId, anchor?.position?.anchor?.nativeId].filter(
    (id) => id != null && id !== '',
  );

  for (const id of ids) {
    const escaped = escapeCssIdent(id);
    const match =
      root.querySelector(`[data-source-node-id="${escaped}"]`) ??
      root.querySelector(`[data-layout-block-ref="${escaped}"]`) ??
      root.querySelector(`[data-layout-fragment-id="${escaped}"]`);
    if (match instanceof HTMLElement) return match;
  }
  return null;
};

function getSelectionBoundingBox(root = null) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!range) return null;

  if (root) {
    const { startContainer, endContainer } = range;
    if (!root.contains(startContainer) || !root.contains(endContainer)) return null;
  }

  try {
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width <= 0 && rect.height <= 0)) return null;
    return rect;
  } catch {
    return null;
  }
}

const rectToLayerBounds = (rect) => {
  if (!rect || !layers.value) return null;
  const layerRect = layers.value.getBoundingClientRect();
  return {
    top: rect.top - layerRect.top,
    left: rect.left - layerRect.left,
    right: rect.right - layerRect.left,
    bottom: rect.bottom - layerRect.top,
    width: rect.width,
    height: rect.height,
  };
};

const readV2PageIndex = (element) => {
  let current = element;
  while (current && current.nodeType === 1) {
    const raw = current.dataset?.pageIndex;
    if (raw != null && raw !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    current = current.parentElement;
  }
  return null;
};

const buildV2FloatingSelection = () => {
  if (!v2HasRangeSelection.value || !isCommentsEnabled.value) return null;

  const selectionRect = getSelectionBoundingBox(getActiveV2MountContainer());
  const bounds = rectToLayerBounds(selectionRect) ?? buildV2PendingPositionEntry()?.bounds ?? null;
  if (!bounds) return null;

  const documentId = proxy.$superdoc?.activeEditor?.options?.documentId ?? proxy.$superdoc?.activeEditor?.documentId;
  if (!documentId) return null;

  const pageIndex = readV2PageIndex(findV2SelectionAnchorElement());
  return useSelection({
    selectionBounds: bounds,
    page: pageIndex != null ? pageIndex + 1 : 1,
    documentId,
    // Reuse the existing SuperEditor selection path so the comments shell can
    // keep using the same floating comment tool in v2 mode.
    source: 'super-editor',
  });
};

const buildV2PendingPositionEntry = () => {
  if (!layers.value) return null;
  const target = findV2SelectionAnchorElement();
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (!rect || (rect.width <= 0 && rect.height <= 0)) return null;
  const layerRect = layers.value.getBoundingClientRect();
  const bounds = {
    top: rect.top - layerRect.top,
    left: rect.left - layerRect.left,
    right: rect.right - layerRect.left,
    bottom: rect.bottom - layerRect.top,
    width: rect.width,
    height: rect.height,
  };
  const pageIndex = readV2PageIndex(target);
  return {
    threadId: 'pending',
    key: 'pending',
    kind: 'pending',
    storyKey: 'body',
    bounds,
    ...(pageIndex != null ? { pageIndex } : {}),
    ...(v2GeometryEpoch.value != null ? { generation: v2GeometryEpoch.value } : {}),
  };
};

const syncV2SelectionToolbarState = () => {
  if (!isV2Mode.value) return;
  if (!v2HasRangeSelection.value) {
    activeSelection.value = null;
    resetSelection();
    return;
  }

  const selection = buildV2FloatingSelection();
  if (!selection) {
    activeSelection.value = null;
    resetSelection();
    return;
  }

  handleSelectionChange(selection);
};

const publishV2PendingPositionEntry = (entry) => {
  if (!entry) return;
  handleEditorLocationsUpdate({
    ...(editorCommentPositions.value ?? {}),
    pending: entry,
  });
};

// TCS Phase 0 / 002: framework-agnostic geometry publisher. Owns alias
// caching, pending-row preservation, missing-mount/layers clearing, and
// scroll/resize/zoom recollection (see `v2-geometry-publisher.js`). The
// SuperDoc.vue side only feeds payloads and observes the published state.
const v2GeometryPublisher = resolvedEditorIntegration.createGeometryPublisher({
  getLayersContainer: () => layers.value ?? null,
  isCommentsEnabled: () => shouldRenderCommentsInViewing.value,
  publishPositions: (positions) => handleEditorLocationsUpdate(positions),
  clearPositions: () => {
    commentsStore.clearEditorCommentPositions?.();
  },
  readCurrentPositions: () => editorCommentPositions.value ?? {},
  setGeometryAvailable: (value) => {
    v2GeometryAvailable.value = Boolean(value);
    if (value) v2GeometryEpoch.value = v2GeometryPublisher.getLastEpoch();
  },
});

const scheduleV2GeometryPublish = (payload) => {
  v2GeometryRender.value = payload;
  if (v2GeometryRafHandle && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(v2GeometryRafHandle);
  }
  if (typeof requestAnimationFrame !== 'function') {
    void v2GeometryPublisher.publish(v2GeometryRender.value);
    return;
  }
  v2GeometryRafHandle = requestAnimationFrame(() => {
    v2GeometryRafHandle = 0;
    void v2GeometryPublisher.publish(v2GeometryRender.value);
  });
};

const onV2Render = (payload) => {
  if (!payload) return;
  scheduleV2GeometryPublish(payload);
  if (v2HasRangeSelection.value) syncV2SelectionToolbarState();
};

// phase13: consume the v2 render-readiness lifecycle as the startup clock for
// review-row hydration. Each transition snapshot is fed to the controller,
// which triggers startup comment + tracked-change hydration once the first
// source-backed window has painted. This carries no rendering semantics — it is
// pure shell orchestration over the existing v2 host readiness API.
const onV2RenderReadiness = (payload) => {
  const snapshot = payload?.snapshot ?? payload ?? null;
  if (!snapshot) return;
  v2ReviewHydrationController.onRenderReadiness(snapshot);
};

// ui-phase4-001: receive v2 page metrics snapshots from V2SuperEditor.
// Mirrors the v1 `presentationEditor.on('paginationUpdate', ...)` path so
// SuperDoc consumers receive a stable `pagination-update` event regardless
// of editor version. Snapshot shape:
//   `{ snapshot: V2PageMetricsSnapshot, host, mount }`.
const v2PageMetricsSnapshot = shallowRef(null);
const onV2PageMetrics = (payload) => {
  if (!payload?.snapshot) return;
  const snapshot = payload.snapshot;
  v2PageMetricsSnapshot.value = snapshot;
  const totalPages = Array.isArray(snapshot.pages) ? snapshot.pages.length : 0;
  // The pagination-update event payload mirrors the v1 shape
  // (`{ totalPages, superdoc }`) so existing consumers don't need to
  // discriminate on editor version. The richer snapshot is reachable
  // through `superdoc.activeEditor.pageMetrics.getSnapshot()`.
  proxy.$superdoc.emit('pagination-update', { totalPages, superdoc: proxy.$superdoc });
  // ui-phase4-002: keep the ruler container offset aligned with the v2 paint
  // wrapper. Repaint may shift the wrapper bounds (zoom changes, page count
  // changes, scroll); sync once per snapshot so the ruler stays glued to the
  // page stack.
  nextTick(() => {
    syncV2RulerOffset();
    setupV2RulerObservers();
  });
};

const onV2RenderCleared = () => {
  if (v2GeometryRafHandle && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(v2GeometryRafHandle);
  }
  v2GeometryRafHandle = 0;
  v2GeometryRender.value = null;
  v2GeometryEpoch.value = null;
  v2GeometryAvailable.value = false;
  v2GeometryPublisher.reset();
  v2HasRangeSelection.value = false;
  v2SelectionSnapshot.value = null;
  activeSelection.value = null;
  resetSelection();
  v2PageMetricsSnapshot.value = null;
  // Cancel/invalidate any pending startup review hydration BEFORE the adapters
  // are nulled. A hydration still in flight from the previous document will be
  // dropped at the controller (generation guard); the store's adapter-identity
  // check is the final guard once the adapters below are cleared.
  v2ReviewHydrationController.reset('render-cleared');
  commentsStore.setV2CommentsAdapter?.(null);
  commentsStore.setV2TrackedChangesAdapter?.(null);
  commentsStore.clearEditorCommentPositions?.();
  clearActiveV2EditorFacade();
  // ui-phase4-002: tear down ruler observers on document switch / dispose.
  cleanupV2RulerObservers();
  v2RulerHostStyle.value = {};
  v2RulerReady.value = false;
};

// ui-phase3-003 / mutation-plane consolidation: refresh v2 review rows from
// the v2 host after every committed mutation. Direct sidebar mutations already
// settle their own adapter refresh, but document-level history undo/redo
// commits through `activeEditor.doc.history.*`; this listener keeps comments
// and tracked-change sidebars reconciled with the document model.
const onV2HostEvent = (event) => {
  if (!event) return;
  if (event.type !== 'mutation:committed') return;
  const commentsAdapter = proxy.$superdoc?.activeEditor?.v2Comments ?? null;
  if (commentsAdapter) {
    void commentsStore.hydrateCommentsFromV2?.({
      superdoc: proxy.$superdoc,
      adapter: commentsAdapter,
      documentId: proxy.$superdoc?.activeEditor?.documentId ?? null,
    });
  }
  const trackedChangesAdapter = proxy.$superdoc?.activeEditor?.v2TrackedChanges ?? null;
  if (!trackedChangesAdapter) return;
  void commentsStore.hydrateTrackedChangesFromV2?.({
    superdoc: proxy.$superdoc,
    adapter: trackedChangesAdapter,
    documentId: proxy.$superdoc?.activeEditor?.documentId ?? null,
  });
};

const recollectV2GeometryIfActive = () => {
  if (!isV2Mode.value) return;
  if (!v2GeometryPublisher.getLastPayload()) return;
  // Scroll / resize / zoom may change layer-relative coords without advancing
  // the v2 paint epoch. The publisher reuses the per-epoch alias cache so a
  // recollect does not call `comments.list()` again (plan §4).
  if (v2GeometryRafHandle && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(v2GeometryRafHandle);
  }
  if (typeof requestAnimationFrame !== 'function') {
    void v2GeometryPublisher.recollect();
    return;
  }
  v2GeometryRafHandle = requestAnimationFrame(() => {
    v2GeometryRafHandle = 0;
    void v2GeometryPublisher.recollect();
  });
};

const onV2EditorFailed = (payload) => {
  clearActiveV2EditorFacade();
  proxy.$superdoc.emit('exception', {
    error: new Error(`v2-editor: ${payload?.reason ?? 'open-failed'}${payload?.detail ? ':' + payload.detail : ''}`),
    code: payload?.reason ?? 'open-failed',
    editor: null,
  });
};

const onEditorFocus = ({ editor }) => {
  const documentId = editor?.options?.documentId;
  const entry = documentId ? v1Runtimes.get(documentId) : null;
  if (entry) proxy.$superdoc.setActiveRuntime(entry.runtimeId, 'v1-editor-focus');
  proxy.$superdoc.setActiveEditor(editor);
};

// Shell-owned product DOM hit capture. Real focus/pointer hits inside a marked
// runtime root activate the owning runtime through the registry. This handler
// stays deliberately minimal: it resolves a runtime from the event target and
// does nothing editor-semantic — no painter DOM inspection, no coordinate
// mapping, no command dispatch, no selection semantics. Activation outside any
// marked root is a no-op (the registry returns no owner).
const activateRuntimeFromEvent = (event, reason) => {
  proxy.$superdoc?.activateRuntimeFromEventTarget?.(event.target, reason);
};
const handleRuntimeFocusIn = (event) => activateRuntimeFromEvent(event, 'focusin');
const handleRuntimePointerDown = (event) => activateRuntimeFromEvent(event, 'pointerdown');
// `mousedown` is a fallback for environments that do not dispatch pointer
// events consistently; it routes through the same idempotent activation path.
const handleRuntimeMouseDown = (event) => activateRuntimeFromEvent(event, 'mousedown');

const onEditorDocumentLocked = ({ editor, isLocked, lockedBy }) => {
  proxy.$superdoc.lockSuperdoc(isLocked, lockedBy);
};

const buildEditorPayloadBase = ({
  editor,
  sourceEditor,
  surface = 'body',
  headerId = null,
  sectionType = null,
} = {}) => {
  const effectiveEditor = editor ?? sourceEditor;
  return {
    editor: effectiveEditor,
    sourceEditor: sourceEditor ?? effectiveEditor,
    surface,
    headerId,
    sectionType,
  };
};

const buildEditorUpdatePayload = (payload = {}) => {
  return buildEditorPayloadBase(payload);
};

const onEditorUpdate = (payload = {}) => {
  proxy.$superdoc.emit('editor-update', buildEditorUpdatePayload(payload));
};

const buildEditorTransactionPayload = ({ transaction, duration, ...payload } = {}) => {
  return {
    ...buildEditorPayloadBase(payload),
    transaction,
    duration,
  };
};

const emitEditorTransaction = (payload = {}) => {
  if (typeof proxy.$superdoc.config.onTransaction === 'function') {
    proxy.$superdoc.config.onTransaction(payload);
  }
};

let selectionUpdateRafId = null;
const onEditorSelectionChange = ({ editor }) => {
  // Always cancel any pending RAF first — a queued callback from a previous
  // call could fire after mode switches and repopulate stale selection state.
  if (selectionUpdateRafId != null) {
    cancelAnimationFrame(selectionUpdateRafId);
    selectionUpdateRafId = null;
  }

  if (skipSelectionUpdate.value) {
    // When comment is added selection will be equal to comment text
    // Should skip calculations to keep text selection for comments correct
    skipSelectionUpdate.value = false;
    if (isViewingMode() && !allowSelectionInViewMode()) {
      resetSelection();
    }
    return;
  }

  if (isViewingMode() && !allowSelectionInViewMode()) {
    resetSelection();
    return;
  }

  // Defer selection-related Vue reactive updates to the next animation frame.
  // Without this, each PM transaction synchronously mutates reactive refs (selectionPosition,
  // activeSelection, toolsMenuPosition), which triggers Vue's flushJobs microtask to re-evaluate
  // hundreds of components — blocking the main thread for ~300ms per keystroke.
  // RAF batches this work with the layout pipeline rerender, keeping typing responsive.
  // Note: we capture only `editor` (not `transaction`) — by the time RAF fires,
  // ProseMirror may have processed more keystrokes, making the transaction stale.
  // processSelectionChange already reads editor.state.selection as the primary source.
  selectionUpdateRafId = requestAnimationFrame(() => {
    selectionUpdateRafId = null;
    if (isViewingMode() && !allowSelectionInViewMode()) {
      resetSelection();
      return;
    }
    processSelectionChange(editor);
  });
};

const processSelectionChange = (editor, transaction) => {
  const { documentId } = editor.options;
  const txnSelection = transaction?.selection;
  const stateSelection = editor.state?.selection ?? editor.view?.state?.selection;
  const selectionWithPositions =
    (txnSelection?.$from && txnSelection?.$to && txnSelection) || stateSelection || txnSelection;

  if (!selectionWithPositions) return;

  const { $from, $to } = selectionWithPositions;
  if (!$from || !$to) return;

  const docSize =
    editor.state?.doc?.content?.size ?? editor.view?.state?.doc?.content?.size ?? Number.POSITIVE_INFINITY;

  if ($from.pos > docSize || $to.pos > docSize) {
    updateSelection({ x: null, y: null, x2: null, y2: null, source: 'super-editor' });
    return;
  }

  if ($from.pos === $to.pos) updateSelection({ x: null, y: null, x2: null, y2: null, source: 'super-editor' });

  if (!layers.value) return;

  const presentation = PresentationEditor.getInstance(documentId);
  if (!presentation) {
    // Fallback to legacy coordinate calculation if PresentationEditor not yet initialized
    const { view } = editor;
    const safeCoordsAtPos = (pos) => {
      try {
        return view.coordsAtPos(pos);
      } catch (err) {
        console.warn('[superdoc] Ignoring selection coords error', err);
        return null;
      }
    };

    const fromCoords = safeCoordsAtPos($from.pos);
    const toCoords = safeCoordsAtPos($to.pos);
    if (!fromCoords || !toCoords) return;

    const layerBounds = layers.value.getBoundingClientRect();
    const HEADER_HEIGHT = 96;
    const top = Math.max(HEADER_HEIGHT, fromCoords.top - layerBounds.top);
    const bottom = toCoords.bottom - layerBounds.top;
    const selectionBounds = {
      top,
      left: fromCoords.left,
      right: toCoords.left,
      bottom,
    };

    const selectionResult = useSelection({
      selectionBounds,
      page: 1,
      documentId,
      source: 'super-editor',
    });
    handleSelectionChange(selectionResult);
    return;
  }

  const layoutRange = presentation.getSelectionBounds($from.pos, $to.pos, layers.value);
  if (layoutRange) {
    const { bounds, pageIndex } = layoutRange;
    updateSelection({
      startX: bounds.left,
      startY: bounds.top,
      x: bounds.right,
      y: bounds.bottom,
      source: 'super-editor',
    });
    const selectionResult = useSelection({
      selectionBounds: { ...bounds },
      page: pageIndex + 1,
      documentId,
      source: 'super-editor',
    });
    handleSelectionChange(selectionResult);
    return;
  }

  const { view } = editor;
  const safeCoordsAtPos = (pos) => {
    try {
      return view.coordsAtPos(pos);
    } catch (err) {
      console.warn('[superdoc] Ignoring selection coords error', err);
      return null;
    }
  };

  const fromCoords = safeCoordsAtPos($from.pos);
  const toCoords = safeCoordsAtPos($to.pos);
  if (!fromCoords || !toCoords) return;

  const layerBounds = layers.value.getBoundingClientRect();
  const HEADER_HEIGHT = 96;
  // Ensure the selection is not placed at the top of the page
  const top = Math.max(HEADER_HEIGHT, fromCoords.top - layerBounds.top);
  const bottom = toCoords.bottom - layerBounds.top;
  const selectionBounds = {
    top,
    left: fromCoords.left,
    right: toCoords.left,
    bottom,
  };

  const selectionResult = useSelection({
    selectionBounds,
    page: 1,
    documentId,
    source: 'super-editor',
  });
  handleSelectionChange(selectionResult);
};

const onEditorCollaborationReady = ({ editor }) => {
  proxy.$superdoc.emit('collaboration-ready', { editor });

  nextTick(() => {
    isReady.value = true;

    const urlParams = new URLSearchParams(window.location.search);
    const commentId = urlParams.get('commentId');
    if (commentId) scrollToComment(commentId);
  });
};

const onEditorContentError = ({ error, editor }) => {
  proxy.$superdoc.emit('content-error', { error, editor });
};

const onEditorException = (doc, { error, editor, code }) => {
  const handled = passwordPrompt.handleEncryptionError(doc, code, { error, editor });
  if (handled) return true;
  proxy.$superdoc.emit('exception', { error, editor, code, documentId: doc?.id });
  return false;
};

const onEditorListdefinitionsChange = (params) => {
  proxy.$superdoc.emit('list-definitions-change', params);
};

let suppressCommentActivationUntilTs = 0;

const markContextMenuOpen = () => {
  suppressCommentActivationUntilTs = Date.now() + RIGHT_CLICK_COMMENT_SUPPRESS_MS;
};

const shouldSuppressCommentActivation = () => Date.now() < suppressCommentActivationUntilTs;

const handleDocumentContextMenu = (event) => {
  const root = superdocRoot.value;
  if (!root) return;
  if (!(event.target instanceof Node) || !root.contains(event.target)) return;
  if (layers.value?.contains(event.target)) {
    commentsStore.setActiveComment(proxy.$superdoc, null);
    commentsStore.removePendingComment(proxy.$superdoc);
    resetClickAnchor();
  }
  markContextMenuOpen();
};

const editorOptions = (doc) => {
  // We only want to run the font check if the user has provided a callback
  // The font check might request extra permissions, and we don't want to run it unless the developer has requested it
  // So, if the callback is not defined, we won't run the font check
  const onFontsResolvedFn =
    proxy.$superdoc.listeners?.('fonts-resolved')?.length > 0 ? proxy.$superdoc.listeners('fonts-resolved')[0] : null;
  const useLayoutEngine = proxy.$superdoc.config.useLayoutEngine !== false;

  const ydocFragment = doc.ydoc?.getXmlFragment?.('supereditor');
  const ydocParts = doc.ydoc?.getMap?.('parts');
  const ydocMeta = doc.ydoc?.getMap?.('meta');
  const legacyContent = ydocMeta?.has('docx');
  const ydocHasContent =
    (ydocFragment && ydocFragment.length > 0) || (ydocParts && ydocParts.size > 0) || legacyContent;
  const isNewFile = doc.isNewFile && !ydocHasContent;
  const benchmarkExecutionMode = proxy.$superdoc.config?.benchmarkExecutionMode;
  const benchmarkTraceEnabled = proxy.$superdoc.config?.benchmarkTraceEnabled === true;

  const options = {
    isDebug: proxy.$superdoc.config.isDebug || false,
    documentId: doc.id,
    user: proxy.$superdoc.user,
    users: proxy.$superdoc.users,
    colors: proxy.$superdoc.colors,
    role: proxy.$superdoc.config.role,
    html: doc.html,
    markdown: doc.markdown,
    documentMode: proxy.$superdoc.config.documentMode,
    ...(benchmarkExecutionMode ? { benchmarkExecutionMode } : {}),
    ...(benchmarkTraceEnabled ? { benchmarkTraceEnabled: true } : {}),
    allowSelectionInViewMode: proxy.$superdoc.config.allowSelectionInViewMode,
    rulers: doc.rulers,
    rulerContainer: proxy.$superdoc.config.rulerContainer,
    isInternal: proxy.$superdoc.config.isInternal,
    annotations: proxy.$superdoc.config.annotations,
    isCommentsEnabled: Boolean(commentsModuleConfig.value),
    isAiEnabled: proxy.$superdoc.config.modules?.ai,
    contextMenuConfig: (() => {
      if (proxy.$superdoc.config.modules?.slashMenu && !proxy.$superdoc.config.modules?.contextMenu) {
        console.warn('[SuperDoc] modules.slashMenu is deprecated. Use modules.contextMenu instead.');
      }
      return proxy.$superdoc.config.modules?.contextMenu ?? proxy.$superdoc.config.modules?.slashMenu;
    })(),
    /** @deprecated Use contextMenuConfig instead */
    slashMenuConfig: proxy.$superdoc.config.modules?.contextMenu ?? proxy.$superdoc.config.modules?.slashMenu,
    comments: {
      highlightColors: commentsModuleConfig.value?.highlightColors,
      highlightOpacity: commentsModuleConfig.value?.highlightOpacity,
    },
    trackedChanges: proxy.$superdoc.config.modules?.trackChanges,
    experimental: proxy.$superdoc.config.experimental,
    ...(doc.v2Collaboration ? { v2Collaboration: doc.v2Collaboration } : {}),
    editorCtor: useLayoutEngine ? PresentationEditor : undefined,
    onBeforeCreate: onEditorBeforeCreate,
    onCreate: onEditorCreate,
    onDestroy: onEditorDestroy,
    onFocus: onEditorFocus,
    onDocumentLocked: onEditorDocumentLocked,
    onUpdate: onEditorUpdate,
    onSelectionUpdate: onEditorSelectionChange,
    onCollaborationReady: onEditorCollaborationReady,
    onContentError: onEditorContentError,
    onException: (payload) => onEditorException(doc, payload),
    onCommentsLoaded,
    onCommentsUpdate: onEditorCommentsUpdate,
    onCommentLocationsUpdate: (payload) => onEditorCommentLocationsUpdate(doc, payload),
    onListDefinitionsChange: onEditorListdefinitionsChange,
    onFontsResolved: onFontsResolvedFn,
    fontAssets: proxy.$superdoc.config.fonts,
    onTransaction: onEditorTransaction,
    ydoc: doc.ydoc,
    collaborationProvider: doc.provider || null,
    isNewFile,
    password: getDocumentLoadPassword(doc),
    handleImageUpload: proxy.$superdoc.config.handleImageUpload,
    externalExtensions: proxy.$superdoc.config.editorExtensions || [],
    suppressDefaultDocxStyles: proxy.$superdoc.config.suppressDefaultDocxStyles,
    disableContextMenu: proxy.$superdoc.config.disableContextMenu,
    jsonOverride: proxy.$superdoc.config.jsonOverride,
    viewOptions: proxy.$superdoc.config.viewOptions,
    contained: proxy.$superdoc.config.contained,
    linkPopoverResolver: proxy.$superdoc.config.modules?.links?.popoverResolver,
    layoutEngineOptions: useLayoutEngine
      ? {
          ...(proxy.$superdoc.config.layoutEngineOptions || {}),
          proofing: resolvedProofingConfig.value,
          debugLabel: proxy.$superdoc.config.layoutEngineOptions?.debugLabel ?? doc.name ?? doc.id,
          zoom: (activeZoom.value ?? 100) / 100,
          emitCommentPositionsInViewing: isViewingMode() && shouldRenderCommentsInViewing.value,
          enableCommentsInViewing: isViewingCommentsVisible.value,
          contentControlsChrome: proxy.$superdoc.config.modules?.contentControls?.chrome,
          resolveTrackedChangeColor: composeAuthorColorResolver(
            proxy.$superdoc.config.modules?.trackChanges?.authorColors,
          ),
        }
      : undefined,
    permissionResolver: (payload = {}) =>
      proxy.$superdoc.canPerformPermission({
        role: proxy.$superdoc.config.role,
        isInternal: proxy.$superdoc.config.isInternal,
        ...payload,
      }),
    licenseKey: proxy.$superdoc.config.licenseKey,
    telemetry: proxy.$superdoc.config.telemetry?.enabled
      ? {
          enabled: true,
          endpoint: proxy.$superdoc.config.telemetry?.endpoint,
          metadata: proxy.$superdoc.config.telemetry?.metadata,
          licenseKey: proxy.$superdoc.config.telemetry?.licenseKey,
        }
      : null,
  };

  return options;
};

/**
 * Trigger a comment-positions location update
 * This is called when the PM plugin emits comment locations.
 *
 * Note: When using the layout engine, PresentationEditor emits authoritative
 * positions via the 'commentPositions' event after each layout. This handler
 * primarily serves as a fallback for non-layout-engine mode.
 *
 * @returns {void}
 */
const onEditorCommentLocationsUpdate = (doc, { allCommentIds: activeThreadId, allCommentPositions } = {}) => {
  const commentsConfig = proxy.$superdoc.config.modules?.comments;
  if (!commentsConfig || commentsConfig === false) return;
  if (!shouldRenderCommentsInViewing.value) {
    commentsStore.clearEditorCommentPositions?.();
    return;
  }

  const presentation = PresentationEditor.getInstance(doc.id);
  if (!presentation) {
    // Non-layout-engine mode: pass through raw positions
    handleEditorLocationsUpdate(allCommentPositions, activeThreadId);
    flushPendingReplayTrackedChangeSync();
    return;
  }

  // Layout engine mode: map PM positions to visual layout coordinates.
  // Note: PresentationEditor's 'commentPositions' event provides fresh positions
  // after every layout, so this is mainly for the initial load before layout completes.
  const mappedPositions = presentation.getCommentBounds(allCommentPositions, layers.value);
  handleEditorLocationsUpdate(mappedPositions, activeThreadId);
  flushPendingReplayTrackedChangeSync();
};

// Replay updates should only patch mutable comment state.
// Identity and construction-time metadata are intentionally excluded.
const REPLAY_MUTABLE_COMMENT_FIELDS = new Set([
  'commentText',
  'isInternal',
  'parentCommentId',
  'trackedChangeParentId',
  'threadingParentCommentId',
  'trackedChange',
  'trackedChangeType',
  'trackedChangeText',
  'trackedChangeDisplayType',
  'trackedChangeStory',
  'trackedChangeStoryKind',
  'trackedChangeStoryLabel',
  'trackedChangeAnchorKey',
  'deletedText',
  'resolvedTime',
  'resolvedById',
  'resolvedByEmail',
  'resolvedByName',
  'importedAuthor',
  'docxCommentJSON',
]);

const applyReplayIsDoneResolutionFallback = (target, payload = {}) => {
  if (!target || payload.isDone === undefined) return;
  if (
    payload.resolvedTime != null ||
    payload.resolvedById != null ||
    payload.resolvedByEmail != null ||
    payload.resolvedByName != null
  ) {
    return;
  }

  // Imported replay payloads often use `isDone` while resolved fields remain null.
  // When resolved fields are not explicitly populated, derive sidebar/export state from `isDone`.
  if (payload.isDone) {
    target.resolvedTime = target.resolvedTime || Date.now();
    target.resolvedById = target.resolvedById || payload.creatorId || null;
    target.resolvedByEmail = target.resolvedByEmail || payload.creatorEmail || null;
    target.resolvedByName = target.resolvedByName || payload.creatorName || null;
    return;
  }

  target.resolvedTime = null;
  target.resolvedById = null;
  target.resolvedByEmail = null;
  target.resolvedByName = null;
};

const applyReplayUpdateToComment = (commentModel, payload, resolvedText) => {
  if (!commentModel || !payload) return;

  if (Array.isArray(payload.elements)) {
    commentModel.docxCommentJSON = payload.elements;
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'text') return;
    if (key === 'elements') return;
    if (!REPLAY_MUTABLE_COMMENT_FIELDS.has(key)) return;
    commentModel[key] = value;
  });

  if (resolvedText !== undefined) {
    commentModel.commentText = resolvedText;
  }

  applyReplayIsDoneResolutionFallback(commentModel, payload);
};

const normalizeReplayCommentModelPayload = (payload = {}) => {
  const normalizedPayload = { ...payload };
  if (!normalizedPayload.commentText && normalizedPayload.text) {
    normalizedPayload.commentText = normalizedPayload.text;
  }
  if (!normalizedPayload.docxCommentJSON && Array.isArray(normalizedPayload.elements)) {
    normalizedPayload.docxCommentJSON = normalizedPayload.elements;
  }
  applyReplayIsDoneResolutionFallback(normalizedPayload, normalizedPayload);
  return normalizedPayload;
};

const syncInstantSidebarAlignmentFromEditorSelection = (commentId) => {
  if (Number.isFinite(peekInstantSidebarAlignment())) {
    return;
  }

  if (commentId == null) {
    clearInstantSidebarAlignment();
    return;
  }

  const layersElement = layers.value;
  const { entry } = resolveCommentPositionEntry(commentId);
  const targetClientY = getVisibleThreadAnchorClientY(layersElement, entry);

  if (Number.isFinite(targetClientY)) {
    requestInstantSidebarAlignment(targetClientY, commentId);
    return;
  }

  clearInstantSidebarAlignment();
};

const isSameActiveCommentSelection = (commentId) => {
  if (commentId == null || activeComment.value == null) {
    return false;
  }

  return String(activeComment.value) === String(commentId);
};

const onEditorCommentsUpdate = (params = {}) => {
  // Set the active comment in the store
  let { activeCommentId, type, comment: commentPayload } = params;
  // Only sync active state when the event explicitly requests it.
  // Replay add/update events often omit activeCommentId; inferring it here can
  // cause repeated focus toggles while replay emits batched updates.
  let shouldSyncActiveComment = Object.prototype.hasOwnProperty.call(params, 'activeCommentId');
  const resolveCommentEventIds = (payload) => {
    const ids = [payload?.importedId, payload?.commentId].filter(Boolean).map((value) => String(value));
    return [...new Set(ids)];
  };
  const resolveDocumentScopedCommentMatch = (payload) => {
    const candidateIds = [payload?.importedId, payload?.commentId].filter(Boolean).map((value) => String(value));
    const activeDocumentId =
      proxy.$superdoc?.activeEditor?.options?.documentId != null
        ? String(proxy.$superdoc.activeEditor.options.documentId)
        : null;

    for (const candidateId of candidateIds) {
      const existingComment = commentsList.value.find((comment) => {
        const commentId = comment?.commentId != null ? String(comment.commentId) : null;
        const importedId = comment?.importedId != null ? String(comment.importedId) : null;
        const isIdMatch = commentId === candidateId || importedId === candidateId;
        if (!isIdMatch) return false;
        if (!activeDocumentId || typeof belongsToDocument !== 'function') return true;
        return belongsToDocument(comment, activeDocumentId);
      });

      if (existingComment) {
        const matchedCommentId = existingComment?.commentId ?? existingComment?.importedId ?? candidateId;
        return {
          id: matchedCommentId != null ? String(matchedCommentId) : null,
          existingComment,
        };
      }
    }
    return {
      id: candidateIds[0] || null,
      existingComment: null,
    };
  };

  if (type === 'replayCompleted') {
    scheduleReplayTrackedChangeSync();
  }

  if (COMMENT_EVENTS?.ADD && type === COMMENT_EVENTS.ADD && commentPayload) {
    commentPayload = normalizeReplayCommentModelPayload(commentPayload);

    const currentUser = proxy.$superdoc?.user;
    if (currentUser) {
      if (!commentPayload.creatorId) commentPayload.creatorId = currentUser.id;
      if (!commentPayload.creatorName) commentPayload.creatorName = currentUser.name;
      if (!commentPayload.creatorEmail) commentPayload.creatorEmail = currentUser.email;
    }

    if (!commentPayload.createdTime) commentPayload.createdTime = Date.now();

    const primaryDocumentId = commentPayload.documentId || documents.value?.[0]?.id;
    if (!commentPayload.documentId && primaryDocumentId) {
      commentPayload.documentId = primaryDocumentId;
    }

    if (!commentPayload.fileId && primaryDocumentId) {
      commentPayload.fileId = primaryDocumentId;
    }

    const { id, existingComment } = resolveDocumentScopedCommentMatch(commentPayload);
    if (id && !existingComment) {
      const commentModel = useComment(commentPayload);
      addComment({ superdoc: proxy.$superdoc, comment: commentModel, skipEditorUpdate: true });
    }
  }

  if (COMMENT_EVENTS?.UPDATE && type === COMMENT_EVENTS.UPDATE && commentPayload) {
    const { id, existingComment } = resolveDocumentScopedCommentMatch(commentPayload);
    if (id) {
      const resolvedText = commentPayload.commentText || commentPayload.text;

      if (existingComment) {
        applyReplayUpdateToComment(existingComment, commentPayload, resolvedText);
      } else {
        const normalizedPayload = normalizeReplayCommentModelPayload(commentPayload);
        const commentModel = useComment(normalizedPayload);
        addComment({ superdoc: proxy.$superdoc, comment: commentModel, skipEditorUpdate: true });
      }
    }
  }

  if (COMMENT_EVENTS?.DELETED && type === COMMENT_EVENTS.DELETED && commentPayload) {
    const targetIds = resolveCommentEventIds(commentPayload);
    if (targetIds.length) {
      const activeDocumentId =
        proxy.$superdoc?.activeEditor?.options?.documentId != null
          ? String(proxy.$superdoc.activeEditor.options.documentId)
          : null;
      const isInActiveDocument = (comment) => {
        if (!activeDocumentId || typeof belongsToDocument !== 'function') return true;
        return belongsToDocument(comment, activeDocumentId);
      };

      // Remove the entire thread subtree (parent + all descendants), not only direct replies.
      const removedCommentIds = new Set();
      commentsList.value.forEach((comment) => {
        if (!isInActiveDocument(comment)) return;
        const commentId = comment.commentId != null ? String(comment.commentId) : null;
        const importedId = comment.importedId != null ? String(comment.importedId) : null;
        const matchesTarget =
          (commentId && targetIds.includes(commentId)) || (importedId && targetIds.includes(importedId));
        if (!matchesTarget) return;
        if (commentId) removedCommentIds.add(commentId);
        if (importedId) removedCommentIds.add(importedId);
      });

      if (removedCommentIds.size) {
        let expanded = true;
        while (expanded) {
          expanded = false;
          commentsList.value.forEach((comment) => {
            if (!isInActiveDocument(comment)) return;
            const commentId = comment.commentId != null ? String(comment.commentId) : null;
            const importedId = comment.importedId != null ? String(comment.importedId) : null;
            const parentCommentId = comment.parentCommentId != null ? String(comment.parentCommentId) : null;
            const trackedChangeParentId =
              comment.trackedChangeParentId != null ? String(comment.trackedChangeParentId) : null;

            const isRemovedComment =
              (commentId && removedCommentIds.has(commentId)) || (importedId && removedCommentIds.has(importedId));
            const isDescendantOfRemovedComment =
              (parentCommentId && removedCommentIds.has(parentCommentId)) ||
              (trackedChangeParentId && removedCommentIds.has(trackedChangeParentId));
            if (!isRemovedComment && !isDescendantOfRemovedComment) return;

            const sizeBefore = removedCommentIds.size;
            if (commentId) removedCommentIds.add(commentId);
            if (importedId) removedCommentIds.add(importedId);
            if (removedCommentIds.size > sizeBefore) {
              expanded = true;
            }
          });
        }

        const previousComments = [...commentsList.value];
        commentsList.value = commentsList.value.filter((comment) => {
          if (!isInActiveDocument(comment)) return true;
          const commentId = comment.commentId != null ? String(comment.commentId) : null;
          const importedId = comment.importedId != null ? String(comment.importedId) : null;
          return !(
            (commentId && removedCommentIds.has(commentId)) ||
            (importedId && removedCommentIds.has(importedId))
          );
        });

        const activeCommentKey = activeComment.value != null ? String(activeComment.value) : null;
        const activeCommentModel =
          activeCommentKey != null
            ? previousComments.find((comment) => {
                const commentId = comment.commentId != null ? String(comment.commentId) : null;
                const importedId = comment.importedId != null ? String(comment.importedId) : null;
                return commentId === activeCommentKey || importedId === activeCommentKey;
              })
            : null;
        const activeCommentInActiveDocument = activeCommentModel ? isInActiveDocument(activeCommentModel) : false;
        if (activeCommentKey && removedCommentIds.has(activeCommentKey) && activeCommentInActiveDocument) {
          activeCommentId = null;
          shouldSyncActiveComment = true;
        }
      }
    }
  }

  if (type === 'trackedChange') {
    handleTrackedChangeUpdate({ superdoc: proxy.$superdoc, params });
  }

  if (shouldSyncActiveComment && activeCommentId != null && shouldSuppressCommentActivation()) {
    shouldSyncActiveComment = false;
  }

  if (shouldSyncActiveComment && (activeCommentId == null || !isSameActiveCommentSelection(activeCommentId))) {
    syncInstantSidebarAlignmentFromEditorSelection(activeCommentId);
  }

  nextTick(() => {
    if (pendingComment.value) return;
    if (shouldSyncActiveComment) {
      commentsStore.setActiveComment(proxy.$superdoc, activeCommentId);
    }
    // Briefly suppress click-outside so the same click that selected the comment
    // highlight in the editor doesn't immediately deactivate it via the sidebar.
    // Reset after the event loop settles so subsequent outside clicks work normally.
    if (shouldSyncActiveComment) {
      isCommentHighlighted.value = true;
      setTimeout(() => {
        isCommentHighlighted.value = false;
      }, 0);
    }
  });

  // Bubble up the event to the user, if handled
  if (typeof proxy.$superdoc.config.onCommentsUpdate === 'function') {
    proxy.$superdoc.config.onCommentsUpdate(params);
  }
};

const isHistoryUndoRedoInput = (inputType) => inputType === 'historyUndo' || inputType === 'historyRedo';

const isCollaborationReplayTransaction = (transaction, ySyncMeta) => {
  return Boolean(transaction?.docChanged && ySyncMeta?.isChangeOrigin);
};

const isPeerCollaborationReplayTransaction = (transaction, ySyncMeta) => {
  const inputType = transaction?.getMeta?.('inputType');
  return (
    isCollaborationReplayTransaction(transaction, ySyncMeta) &&
    !isHistoryUndoRedoInput(inputType) &&
    !Boolean(ySyncMeta?.isUndoRedoOperation)
  );
};

const shouldResyncTrackedChangeThreads = (transaction, ySyncMeta = transaction?.getMeta?.(ySyncPluginKey)) => {
  const inputType = transaction?.getMeta?.('inputType');
  const isLocalHistoryUndoRedo = isHistoryUndoRedoInput(inputType);
  const isLocalCollabUndoRedo = Boolean(ySyncMeta?.isUndoRedoOperation);

  // Peer editors do not retain the local UndoManager flag. A collaborator's
  // undo/redo arrives as a generic Yjs-origin document replay, so treat those
  // replays as tracked-change resync points and keep the resync path idempotent.
  return isLocalHistoryUndoRedo || isLocalCollabUndoRedo || isCollaborationReplayTransaction(transaction, ySyncMeta);
};

const collectTouchedChangeIds = (transaction) => {
  return collectTouchedTrackedChangeIds(transaction, { trackChangesPluginKey: TrackChangesBasePluginKey });
};

const onEditorTransaction = (payload = {}) => {
  const { editor, transaction } = payload;
  const ySyncMeta = transaction?.getMeta?.(ySyncPluginKey);

  // Call sync on editor transaction for undo/redo in both local history
  // and collaboration replay modes.
  if (shouldResyncTrackedChangeThreads(transaction, ySyncMeta)) {
    const documentId = editor?.options?.documentId;
    commentsStore.syncResolvedCommentsWithDocument?.({ documentId, editor });
    syncTrackedChangePositionsWithDocument({ documentId, editor });
    queueTrackedChangeCommentResync({
      editor,
      // Remote replay should rebuild only local sidebar state. The authoritative
      // collaboration comment update is already shared through the comments ydoc.
      broadcastChanges: !isPeerCollaborationReplayTransaction(transaction, ySyncMeta),
    });
  } else if (transactionTouchesStructuralChange(transaction)) {
    // Structural row tracked changes (whole-table insert/delete) live on node
    // attrs, not inline marks, so the id-based targeted resync cannot see them.
    // Force a full resync so structural bubbles appear/refresh during editing,
    // not only on import.
    queueTrackedChangeCommentResync({ editor });
  } else {
    queueTrackedChangeCommentResync({
      editor,
      changeIds: collectTouchedChangeIds(transaction),
    });
  }

  emitEditorTransaction(buildEditorTransactionPayload(payload));
};

const isCommentsEnabled = computed(() => Boolean(commentsModuleConfig.value));
const shouldUseSidebarComments = computed(() => {
  const displayMode = commentsModuleConfig.value?.displayMode ?? DEFAULT_COMMENTS_DISPLAY_MODE;
  if (!VALID_COMMENTS_DISPLAY_MODES.has(displayMode)) return true;
  if (displayMode === 'sidebar') return true;
  if (displayMode === 'inline') return false;
  // Backward-compatible default: keep sidebar unless integrator explicitly opts into auto.
  if (displayMode !== 'auto') return true;
  return !isCompactCommentsMode.value;
});
const showCommentsSidebar = computed(() => {
  // ui-phase3-001: v2 mode is no longer a hard gate. The sidebar may render
  // once `V2SuperEditor` has published at least one render-epoch-checked
  // geometry snapshot into `editorCommentPositions`. The v1 path is
  // unchanged. v1-only on-document layers (`CommentsLayer`, `AiLayer`,
  // `WhiteboardLayer`, etc.) remain gated by `isV2Mode` until they have
  // their own v2 adapters — only the FloatingComments sidebar is unblocked
  // here.
  if (isV2Mode.value && !v2GeometryAvailable.value) return false;
  if (!shouldRenderCommentsInViewing.value) return false;
  if (!shouldUseSidebarComments.value) return false;
  return (
    pendingComment.value ||
    (floatingComments.value.length > 0 &&
      isReady.value &&
      layers.value &&
      isCommentsEnabled.value &&
      !isCommentsListVisible.value)
  );
});
const activeCompactComment = computed(() => {
  if (showCommentsSidebar.value) return null;
  if (!isCommentsEnabled.value) return null;
  if (pendingComment.value) return pendingComment.value;
  if (!activeComment.value) return null;
  return getComment(activeComment.value) ?? null;
});
const { compactCommentPopoverStyle, closeCompactCommentPopover, resetClickAnchor } = useCompactCommentPopover({
  activeComment,
  pendingComment,
  activeCompactComment,
  showCommentsSidebar,
  superdocRoot,
  layers,
  documents,
  resolveCommentPositionEntry,
  selectionPosition,
  activeZoom,
  clearActiveComment: () => commentsStore.setActiveComment(proxy.$superdoc, null),
  clearPendingComment: () => commentsStore.removePendingComment(proxy.$superdoc),
});
const showToolsFloatingMenu = computed(() => {
  if (!isCommentsEnabled.value) return false;
  return selectionPosition.value && toolsMenuPosition.top && !getConfig.value?.readOnly;
});
const showActiveSelection = computed(() => {
  if (!isCommentsEnabled.value) return false;
  return !getConfig.value?.readOnly && selectionPosition.value;
});
watch(showCommentsSidebar, (value) => {
  proxy.$superdoc.broadcastSidebarToggle(value);
});

// Viewport fit tracking: maintains viewport metrics, emits `viewport-change`,
// and applies the fit-width zoom policy. See composables/use-viewport-fit.js.
useViewportFit({
  getSuperdoc: () => proxy.$superdoc,
  superdocContainerWidth,
  isReady,
  activeZoom,
  zoomMode,
  viewportMetrics,
  showCommentsSidebar,
  rightSidebarRef,
  superdocRoot,
  documents,
});
/**
 * Scroll the page to a given commentId
 *
 * @param {String} commentId The commentId to scroll to
 */
const scrollToComment = (commentId) => {
  proxy.$superdoc.scrollToComment(commentId);
};

// ui-phase3-001: viewport listeners for v2 geometry refresh. Scroll, window
// resize, and the contained-mode shell reposition do not advance the v2
// paint epoch, so we recompute layer-relative bounds against the existing
// painted carriers when those events fire. The listeners short-circuit when
// v2 mode is inactive so v1 customers pay nothing.
const handleViewportScrollOrResize = () => {
  recollectV2GeometryIfActive();
};

onMounted(() => {
  document.addEventListener('contextmenu', handleDocumentContextMenu, true);
  document.addEventListener('keydown', handleDocumentShortcut, true);
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleViewportScrollOrResize, true);
    window.addEventListener('resize', handleViewportScrollOrResize, true);
  }

  // Capture-phase product hit routing: activate the owning runtime from real
  // focus/pointer hits. Capture so a marked root nested under shells that stop
  // propagation still resolves; the handler is idempotent and a no-op outside
  // any marked runtime root.
  document.addEventListener('focusin', handleRuntimeFocusIn, true);
  document.addEventListener('pointerdown', handleRuntimePointerDown, true);
  document.addEventListener('mousedown', handleRuntimeMouseDown, true);

  recalculateCompactCommentsMode();
  ensureCompactMeasurementObserver();
});

// ui-phase3-001: when comments / track-changes are hidden in viewing mode
// (or the layers / v2 mount disappears), clear the published v2 geometry so
// the sidebar does not float over stale bounds. The recompute path picks up
// again on the next render epoch after the user re-enables them.
watch(shouldRenderCommentsInViewing, (value) => {
  if (!isV2Mode.value) return;
  if (value) {
    if (v2GeometryRender.value) {
      scheduleV2GeometryPublish(v2GeometryRender.value);
    }
  } else {
    commentsStore.clearEditorCommentPositions?.();
    v2GeometryAvailable.value = false;
  }
});

// ui-phase3-001: contained-mode and layout-shell repositioning use the
// `.superdoc--contained` / `--web-layout` class toggles which can shift the
// layers element. Re-collect geometry whenever the layers ref reattaches.
watch(layers, () => {
  recollectV2GeometryIfActive();
});

function isFindShortcutEvent(e) {
  return (e.metaKey || e.ctrlKey) && !e.altKey && e.key?.toLowerCase?.() === 'f';
}

function isFormattingMarksShortcutEvent(e) {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.code === 'Digit8' || e.key === '8' || e.key === '*');
}

function isFocusInsideSuperDoc() {
  const root = superdocRoot.value;
  const activeElement = document.activeElement;
  if (!(activeElement instanceof Node)) return false;

  if (root?.contains(activeElement)) {
    return true;
  }

  const activeEditorDom = proxy.$superdoc?.activeEditor?.view?.dom;
  return (
    activeEditorDom instanceof Node && (activeElement === activeEditorDom || activeEditorDom.contains?.(activeElement))
  );
}

function handleFindShortcut(e) {
  if (!isFindShortcutEvent(e)) return;
  if (!isFindReplaceEnabled.value) return;
  // ui-phase2-001: find/replace runs on v1 commands and a v1 active editor.
  // The v2 active-editor facade carries no commands, so swallowing the
  // shortcut would just hide it from the browser without offering a UI.
  // Skip in v2 mode so customers can still use the browser-native find.
  if (isV2Mode.value) return;
  if (!isFocusInsideSuperDoc()) return;

  // Only steal the shortcut if the composable will actually open a surface.
  // If the resolver returns { type: 'none' }, we must let the browser handle Cmd+F.
  if (!findReplace.wouldOpen()) return;

  e.preventDefault();
  e.stopPropagation();
  findReplace.open();
}

function handleFormattingMarksShortcut(e) {
  if (!isFormattingMarksShortcutEvent(e)) return;
  // ui-phase2-001: formatting-marks toggling is a v1 layout-engine
  // preference. The v2 host does not expose a formatting-marks layout
  // toggle in this phase; leave the shortcut to the browser.
  if (isV2Mode.value) return;
  if (!isFocusInsideSuperDoc()) return;

  e.preventDefault();
  e.stopPropagation();
  proxy.$superdoc.toggleFormattingMarks?.();
}

/**
 * Handle document-level shortcuts before browser or shell handlers.
 * Use a capture listener because the dev shell and presentation-mode bridge
 * do not always leave keyboard focus on a node that bubbles through the root.
 */
function handleDocumentShortcut(e) {
  if (e.key === 'Escape' && activeCompactComment.value) {
    e.preventDefault();
    e.stopPropagation();
    closeCompactCommentPopover();
    return;
  }
  handleFindShortcut(e);
  if (e.defaultPrevented) return;
  handleFormattingMarksShortcut(e);
}

function handleContainerKeydown(e) {
  handleFindShortcut(e);
  if (e.defaultPrevented) return;
  handleFormattingMarksShortcut(e);
}

onBeforeUnmount(() => {
  passwordPrompt.destroy();
  findReplace.destroy();
  for (const entry of Array.from(v1Runtimes.values())) {
    entry.adapter.runtime.dispose();
  }
  v1Runtimes.clear();
  subDocumentRoots.clear();
  document.removeEventListener('contextmenu', handleDocumentContextMenu, true);
  document.removeEventListener('keydown', handleDocumentShortcut, true);
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', handleViewportScrollOrResize, true);
    window.removeEventListener('resize', handleViewportScrollOrResize, true);
  }
  if (v2GeometryRafHandle && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(v2GeometryRafHandle);
    v2GeometryRafHandle = 0;
  }
  document.removeEventListener('focusin', handleRuntimeFocusIn, true);
  document.removeEventListener('pointerdown', handleRuntimePointerDown, true);
  document.removeEventListener('mousedown', handleRuntimeMouseDown, true);
  if (selectionUpdateRafId != null) {
    cancelAnimationFrame(selectionUpdateRafId);
    selectionUpdateRafId = null;
  }
});

const selectionLayer = ref(null);
const isDragging = ref(false);

const getSelectionPosition = computed(() => {
  if (!selectionPosition.value || selectionPosition.value.source === 'super-editor') {
    return { x: null, y: null };
  }

  const isPdf = selectionPosition.value.source === 'pdf';
  const zoom = isPdf ? (activeZoom.value ?? 100) / 100 : 1;
  const top = selectionPosition.value.top * zoom;
  const left = selectionPosition.value.left * zoom;
  const right = selectionPosition.value.right * zoom;
  const bottom = selectionPosition.value.bottom * zoom;
  const style = {
    zIndex: 500,
    borderRadius: '4px',
    top: top + 'px',
    left: left + 'px',
    height: Math.abs(top - bottom) + 'px',
    width: Math.abs(left - right) + 'px',
  };
  return style;
});

const handleSelectionChange = (selection) => {
  if (isViewingMode() && !allowSelectionInViewMode()) {
    resetSelection();
    return;
  }
  if (!selection.selectionBounds || !isCommentsEnabled.value) return;

  resetSelection();

  const isMobileView = window.matchMedia('(max-width: 768px)').matches;

  updateSelection({
    startX: selection.selectionBounds.left,
    startY: selection.selectionBounds.top,
    x: selection.selectionBounds.right,
    y: selection.selectionBounds.bottom,
    source: selection.source,
  });

  if (!selectionPosition.value) return;
  const selectionIsWideEnough = Math.abs(selectionPosition.value.left - selectionPosition.value.right) > 5;
  const selectionIsTallEnough = Math.abs(selectionPosition.value.top - selectionPosition.value.bottom) > 5;
  if (!selectionIsWideEnough || !selectionIsTallEnough) {
    if (selectionLayer.value?.style) selectionLayer.value.style.pointerEvents = 'none';
    resetSelection();
    return;
  }

  activeSelection.value = selection;

  // Place the tools menu at the level of the selection
  const isPdf = selection.source === 'pdf' || selection.source?.value === 'pdf';
  const zoom = isPdf ? (activeZoom.value ?? 100) / 100 : 1;
  const top = selection.selectionBounds.top * zoom;
  toolsMenuPosition.top = top + 'px';
  toolsMenuPosition.right = isMobileView ? '0' : '-25px';
};

const resetSelection = () => {
  selectionPosition.value = null;
  toolsMenuPosition.top = null;
};

const updateSelection = ({ startX, startY, x, y, source, page }) => {
  const hasStartCoords = typeof startX === 'number' || typeof startY === 'number';
  const hasEndCoords = typeof x === 'number' || typeof y === 'number';

  if (!hasStartCoords && !hasEndCoords) {
    resetSelection();
    return;
  }

  // Initialize the selection position
  if (!selectionPosition.value) {
    if (startY == null || startX == null) return;
    selectionPosition.value = {
      top: startY,
      left: startX,
      right: startX,
      bottom: startY,
      startX,
      startY,
      source,
      page: page ?? null,
    };
  }

  if (typeof startX === 'number') selectionPosition.value.startX = startX;
  if (typeof startY === 'number') selectionPosition.value.startY = startY;

  // Reverse the selection if the user drags up or left
  if (typeof y === 'number') {
    const selectionTop = selectionPosition.value.startY;
    if (y < selectionTop) {
      selectionPosition.value.top = y;
    } else {
      selectionPosition.value.bottom = y;
    }
  }

  if (typeof x === 'number') {
    const selectionLeft = selectionPosition.value.startX;
    if (x < selectionLeft) {
      selectionPosition.value.left = x;
    } else {
      selectionPosition.value.right = x;
    }
  }
};

const getPdfPageNumberFromEvent = (event) => {
  const x = event?.clientX;
  const y = event?.clientY;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  const elements = document.elementsFromPoint(x, y);
  const pageEl = elements.find((el) => el?.dataset?.pdfPage != null);
  if (pageEl) {
    const pageNumber = Number(pageEl.dataset?.pageNumber);
    return Number.isFinite(pageNumber) ? pageNumber : null;
  }
  return null;
};

const handleSelectionStart = (e) => {
  resetSelection();
  selectionLayer.value.style.pointerEvents = 'auto';

  nextTick(() => {
    isDragging.value = true;
    selectionLayer.value.style.pointerEvents = 'none';
    const pageNumber = getPdfPageNumberFromEvent(e);
    selectionLayer.value.style.pointerEvents = 'auto';
    if (!pageNumber) {
      isDragging.value = false;
      selectionLayer.value.style.pointerEvents = 'none';
      return;
    }
    const layerBounds = selectionLayer.value.getBoundingClientRect();
    const zoom = activeZoom.value / 100;
    const x = (e.clientX - layerBounds.left) / zoom;
    const y = (e.clientY - layerBounds.top) / zoom;
    updateSelection({ startX: x, startY: y, page: pageNumber, source: 'pdf' });
    selectionLayer.value.addEventListener('mousemove', handleDragMove);
  });
};

const handleDragMove = (e) => {
  if (!isDragging.value) return;
  const layerBounds = selectionLayer.value.getBoundingClientRect();
  const zoom = activeZoom.value / 100;
  const x = (e.clientX - layerBounds.left) / zoom;
  const y = (e.clientY - layerBounds.top) / zoom;
  updateSelection({ x, y });
};

const handleDragEnd = (e) => {
  if (!isDragging.value) return;
  selectionLayer.value.removeEventListener('mousemove', handleDragMove);

  if (!selectionPosition.value) return;
  const pageNumber = selectionPosition.value.page ?? getPdfPageNumberFromEvent(e);
  const selection = useSelection({
    selectionBounds: {
      top: selectionPosition.value.top,
      left: selectionPosition.value.left,
      right: selectionPosition.value.right,
      bottom: selectionPosition.value.bottom,
    },
    page: pageNumber ?? 1,
    documentId: documents.value[0].id,
    source: 'pdf',
  });

  handleSelectionChange(selection);
  selectionLayer.value.style.pointerEvents = 'none';
};

const shouldShowSelection = computed(() => {
  const config = proxy.$superdoc.config.modules?.comments;
  if (!config || config === false) return false;
  return !config.readOnly;
});

const handleSuperEditorPageMarginsChange = (doc, params) => {
  doc.documentMarginsLastChange = params.pageMargins;
};

// ui-phase4-002: reactive trigger for the ruler template. Flips true once the
// v2 facade publishes a pageLayout runtime and false on render-cleared /
// document switch. `proxy.$superdoc.activeEditor` itself is a plain property
// (no Vue tracking), so we shadow the readiness signal through a ref so the
// template re-evaluates on hydration.
const v2RulerReady = ref(false);

const unwrapDocField = (value) => {
  if (value && typeof value === 'object' && 'value' in value) return value.value;
  return value;
};

const shouldShowV2Ruler = (doc) => {
  if (!isV2Mode.value) return false;
  if (!doc || doc.type !== DOCX) return false;
  // `doc.rulers` is a Ref produced by `useDocument`; unwrap defensively in
  // case the proxy access surface ever changes.
  const rulersOn = Boolean(unwrapDocField(doc.rulers));
  if (!rulersOn) return false;
  // Re-evaluate when v2RulerReady changes.
  if (!v2RulerReady.value) return false;
  const editor = proxy.$superdoc?.activeEditor;
  if (!editor || editor.editorVersion !== 2) return false;
  const docId = unwrapDocField(doc.id);
  const activeDocumentId = editor.documentId ?? editor.options?.documentId ?? null;
  if (docId && activeDocumentId && docId !== activeDocumentId) return false;
  return Boolean(editor.pageMetrics && editor.pageLayout);
};

// ui-phase4-002: ruler container alignment. Mirrors v1 SuperEditor's
// `syncRulerOffset` but anchors to the v2 paint wrapper (`data-v2-paint-
// wrapper`) instead of `.presentation-editor__viewport` so the ruler stays
// aligned with the v2 page stack rather than a v1-specific class name.
const v2RulerHostStyle = ref({});
let v2RulerEditorObserver = null;
let v2RulerContainerObserver = null;

const resolveV2RulerContainer = () => {
  const container = proxy.$superdoc?.config?.rulerContainer;
  if (!container) return null;
  if (typeof container === 'string') {
    const doc = typeof document !== 'undefined' ? document : globalThis.document;
    return doc?.querySelector(container) ?? null;
  }
  return typeof HTMLElement !== 'undefined' && container instanceof HTMLElement ? container : null;
};

const getV2PaintWrapperRect = () => {
  const stages = Array.from(layers.value?.querySelectorAll('[data-editor-mount="v2"]') ?? []);
  const activeDocumentId =
    proxy.$superdoc?.activeEditor?.documentId ?? proxy.$superdoc?.activeEditor?.options?.documentId ?? null;
  const stage = activeDocumentId
    ? (stages.find((el) => el.dataset?.superdocV2DocumentId === String(activeDocumentId)) ?? null)
    : (stages[0] ?? null);
  if (!stage) return null;
  const wrapper = stage.querySelector('[data-v2-paint-wrapper="true"]') ?? stage;
  return wrapper.getBoundingClientRect();
};

const syncV2RulerOffset = () => {
  if (!isV2Mode.value) {
    v2RulerHostStyle.value = {};
    return;
  }
  const host = resolveV2RulerContainer();
  if (!host) {
    v2RulerHostStyle.value = {};
    return;
  }
  const wrapperRect = getV2PaintWrapperRect();
  if (!wrapperRect) {
    v2RulerHostStyle.value = {};
    return;
  }
  const hostRect = host.getBoundingClientRect();
  const paddingLeft = Math.max(0, wrapperRect.left - hostRect.left);
  const paddingRight = Math.max(0, hostRect.right - wrapperRect.right);
  v2RulerHostStyle.value = {
    paddingLeft: `${paddingLeft}px`,
    paddingRight: `${paddingRight}px`,
  };
};

const cleanupV2RulerObservers = () => {
  try {
    v2RulerEditorObserver?.disconnect();
  } catch {
    /* ignore */
  }
  v2RulerEditorObserver = null;
  try {
    v2RulerContainerObserver?.disconnect();
  } catch {
    /* ignore */
  }
  v2RulerContainerObserver = null;
};

const setupV2RulerObservers = () => {
  cleanupV2RulerObservers();
  if (typeof ResizeObserver === 'undefined') return;
  const layersEl = layers.value;
  const host = resolveV2RulerContainer();
  if (layersEl) {
    v2RulerEditorObserver = new ResizeObserver(() => syncV2RulerOffset());
    v2RulerEditorObserver.observe(layersEl);
  }
  if (host) {
    v2RulerContainerObserver = new ResizeObserver(() => syncV2RulerOffset());
    v2RulerContainerObserver.observe(host);
  }
};

// ui-phase4-002: handle margin change events from V2Ruler. Mirrors the v1
// `handleSuperEditorPageMarginsChange` path so existing consumers reading
// `doc.documentMarginsLastChange` keep working without per-version branching.
const handleV2PageMarginsChange = (doc, event) => {
  if (!doc || !event) return;
  doc.documentMarginsLastChange = event.pageMargins ?? null;
  // Emit a `page-margins-change` event so external listeners can react. The
  // payload includes the section that was edited for v2 multi-section
  // discoverability.
  proxy.$superdoc.emit('page-margins-change', {
    documentId: doc.id,
    editorVersion: 2,
    sectionId: event.sectionId,
    sectionIndex: event.sectionIndex,
    side: event.side,
    value: event.value,
    pageMargins: event.pageMargins,
  });
};

const handlePdfClick = (e) => {
  if (!isCommentsEnabled.value) return;
  resetSelection();
  isDragging.value = true;
  handleSelectionStart(e);
};

const handlePdfSelectionRaw = ({ selectionBounds, documentId, page }) => {
  if (!selectionBounds || !documentId) return;
  const selection = useSelection({
    selectionBounds,
    documentId,
    page,
    source: 'pdf',
  });
  handleSelectionChange(selection);
};

// Web layout without layout engine - apply CSS transform directly
// to non-PDF sub-document containers so zoom works for PM fallback rendering.
// PDF documents are excluded because pdfViewer.updateScale() handles their zoom
// separately; applying both would result in double-zoom.
const applyFallbackZoomStyles = (zoomFactor) => {
  const subDocs = layers.value?.querySelectorAll('.superdoc__sub-document');
  subDocs?.forEach((el) => {
    if (el.querySelector('.sd-pdf-viewer')) return;
    if (zoomFactor === 1) {
      el.style.transformOrigin = '';
      el.style.transform = '';
      el.style.width = '';
    } else {
      el.style.transformOrigin = 'top left';
      el.style.transform = `scale(${zoomFactor})`;
      el.style.width = `${100 / zoomFactor}%`;
    }
  });
};

// One-time initial application for surfaces that only consume zoom
// imperatively. A seeded `zoom.initial` never fires the activeZoom watcher
// (the ref starts at the seeded value), and the fallback transform targets
// elements that do not exist until documents render - so apply once from
// the per-document ready hooks. PresentationEditor and PdfViewer take
// their initial value at creation (layoutEngineOptions.zoom /
// :initial-scale) and need nothing here.
let initialFallbackZoomApplied = false;
const ensureInitialFallbackZoom = () => {
  if (initialFallbackZoomApplied) return;
  if (proxy.$superdoc.config.useLayoutEngine !== false) return;
  const zoomFactor = (activeZoom.value ?? 100) / 100;
  if (zoomFactor === 1) return;
  initialFallbackZoomApplied = true;
  nextTick(() => applyFallbackZoomStyles(zoomFactor));
};

watch(
  () => activeZoom.value,
  (zoom) => {
    const zoomFactor = (zoom ?? 100) / 100;
    const zoomPercent = zoom ?? 100;

    // ui-phase4-001: route DOCX zoom through the v2 page metrics runtime in
    // v2 mode. The v1 PresentationEditor path is skipped entirely for v2
    // DOCX documents — PresentationEditor is not constructed and calling
    // setGlobalZoom would no-op. PDF and HTML viewers stay on their
    // existing paths (still set below).
    const v2PageMetrics = proxy.$superdoc?.activeEditor?.pageMetrics ?? null;
    const v2FacadeActive = isV2Mode.value && proxy.$superdoc?.activeEditor?.editorVersion === 2;

    if (v2FacadeActive && v2PageMetrics?.setZoom) {
      try {
        v2PageMetrics.setZoom(zoomPercent);
      } catch (err) {
        console.warn('[SuperDoc][v2] setZoom failed', err);
      }
    } else if (!isV2Mode.value && proxy.$superdoc.config.useLayoutEngine !== false) {
      PresentationEditor.setGlobalZoom(zoomFactor);
    } else {
      initialFallbackZoomApplied = true;
      applyFallbackZoomStyles(zoomFactor);
    }

    const pdfViewer = getPDFViewer();
    pdfViewer?.updateScale(zoomFactor);

    nextTick(() => {
      updateWhiteboardPageSizes();
      updateWhiteboardPageOffsets();
    });
  },
);

// Ensure hasInitializedLocations is set when comments arrive (backup for cases
// where handleDocumentReady hasn't fired yet). Never toggle false→true→false —
// the virtualized FloatingComments reacts to comment changes via computed properties.
watch(floatingComments, () => {
  if (!hasInitializedLocations.value) {
    hasInitializedLocations.value = true;
  }
});

const {
  whiteboardModuleConfig,
  whiteboard,
  whiteboardPages,
  whiteboardPageSizes,
  whiteboardPageOffsets,
  whiteboardEnabled,
  whiteboardOpacity,
  handleWhiteboardPageReady,
  updateWhiteboardPageSizes,
  updateWhiteboardPageOffsets,
} = useWhiteboard({
  proxy,
  layers,
  documents,
  modules,
});

const getPDFViewer = () => {
  return Array.isArray(pdfViewerRef.value) ? pdfViewerRef.value[0] : pdfViewerRef.value;
};
</script>

<template>
  <div
    ref="superdocRoot"
    class="superdoc"
    :class="{
      'superdoc--with-sidebar': showCommentsSidebar,
      'superdoc--web-layout': proxy.$superdoc.config.viewOptions?.layout === 'web',
      'superdoc--contained': proxy.$superdoc.config.contained,
      'high-contrast': isHighContrastMode,
    }"
    :style="superdocStyleVars"
    @keydown="handleContainerKeydown"
  >
    <div class="superdoc__layers layers" ref="layers" role="group">
      <!-- Floating tools menu (shows up when user has text selection)-->
      <!-- ui-phase3-002: v2 reuses the existing shell comment tool by
           synthesizing the same selection state the v1 path consumes. -->
      <div v-if="showToolsFloatingMenu" class="superdoc__tools tools" :style="toolsMenuPosition">
        <div class="tools-item" data-id="is-tool" @mousedown.stop.prevent="handleToolClick('comments')">
          <div class="superdoc__tools-icon" v-html="superdocIcons.comment"></div>
        </div>
        <!-- AI tool button -->
        <div
          v-if="proxy.$superdoc.config.modules.ai && !isV2Mode"
          class="tools-item"
          data-id="is-tool"
          @mousedown.stop.prevent="handleToolClick('ai')"
        >
          <div class="superdoc__tools-icon ai-tool"></div>
        </div>
      </div>

      <div class="superdoc__document document">
        <div
          v-if="isCommentsEnabled && !isV2Mode"
          class="superdoc__selection-layer selection-layer"
          @mousedown="handleSelectionStart"
          @mouseup="handleDragEnd"
          ref="selectionLayer"
        >
          <div
            :style="getSelectionPosition"
            class="superdoc__temp-selection temp-selection sd-highlight sd-initial-highlight"
            v-if="selectionPosition && shouldShowSelection"
          ></div>
        </div>

        <!-- ui-phase2-001: HrbrFieldsLayer, CommentsLayer, AiLayer, and
             WhiteboardLayer all use the v1 active-editor / PresentationEditor
             surface. The v2 editor exposes none of those today, so the v2
             integration deliberately hides this chrome rather than feeding it
             the v2 facade. Promotion of each layer to v2 is a follow-up plan
             tracked in the close-artifact feature matrix. -->
        <!-- Fields layer -->
        <HrbrFieldsLayer
          v-if="'hrbr-fields' in modules && layers && !isV2Mode"
          :fields="modules['hrbr-fields']"
          class="superdoc__comments-layer comments-layer"
          style="z-index: 2"
        />

        <!-- On-document comments layer -->
        <CommentsLayer
          v-if="layers && !isV2Mode"
          class="superdoc__comments-layer comments-layer"
          style="z-index: 3"
          :parent="layers"
          :user="user"
          @highlight-click="handleHighlightClick"
        />

        <!-- AI Layer for temporary highlights -->
        <AiLayer
          v-if="showAiLayer && !isV2Mode"
          class="ai-layer"
          style="z-index: 4"
          ref="aiLayer"
          :editor="proxy.$superdoc.activeEditor"
        />

        <!-- Whiteboard Layer -->
        <WhiteboardLayer
          v-if="layers && whiteboardModuleConfig && !isV2Mode"
          style="z-index: 3"
          :whiteboard="whiteboard"
          :pages="whiteboardPages"
          :page-sizes="whiteboardPageSizes"
          :page-offsets="whiteboardPageOffsets"
          :enabled="whiteboardEnabled"
          :opacity="whiteboardOpacity"
        />

        <div
          class="superdoc__sub-document sub-document"
          v-for="doc in documents"
          :key="`${doc.id}:${doc.editorMountNonce}`"
          :ref="(el) => setSubDocumentRoot(doc, el)"
        >
          <!-- PDF renderer -->
          <PdfViewer
            v-if="doc.type === PDF"
            :file="doc.data"
            :file-id="doc.id"
            :initial-scale="(activeZoom ?? 100) / 100"
            :config="pdfConfig"
            @selection-raw="handlePdfSelectionRaw"
            @bypass-selection="handlePdfClick"
            @page-rendered="handleWhiteboardPageReady"
            @document-ready="({ documentId, viewerContainer }) => handleDocumentReady(documentId, viewerContainer)"
            ref="pdfViewerRef"
          />

          <SuperEditor
            v-if="doc.type === DOCX && !isV2Mode"
            :file-source="doc.data"
            :state="doc.state"
            :document-id="doc.id"
            :options="{ ...editorOptions(doc), rulers: doc.rulers }"
            @editor-ready="onEditorReady"
            @pageMarginsChange="handleSuperEditorPageMarginsChange(doc, $event)"
          />

          <!-- ui-phase2-001: v2 DOCX editor branch. Active only when
               `editorVersion: 2` is passed to `new SuperDoc(...)`. The wrapper
               owns createV2EditorHost/open/mount/save/dispose; it never
               constructs a v1 Editor or PresentationEditor. -->
          <!-- ui-phase4-002: v2 ruler. Teleported to `rulerContainer` when
               supplied (mirrors v1 SuperEditor behavior); rendered inline
               above the v2 stage otherwise. Visibility tracks the existing
               `rulers` setting per document. -->
          <template v-if="doc.type === DOCX && isV2Mode && V2Ruler && shouldShowV2Ruler(doc)">
            <Teleport v-if="proxy.$superdoc.config.rulerContainer" :to="proxy.$superdoc.config.rulerContainer">
              <div class="v2-ruler-host" :style="v2RulerHostStyle">
                <V2Ruler
                  :page-metrics="proxy.$superdoc.activeEditor.pageMetrics"
                  :page-layout="proxy.$superdoc.activeEditor.pageLayout"
                  @page-margins-change="(event) => handleV2PageMarginsChange(doc, event)"
                />
              </div>
            </Teleport>
            <div v-else class="v2-ruler-host" :style="v2RulerHostStyle">
              <V2Ruler
                :page-metrics="proxy.$superdoc.activeEditor.pageMetrics"
                :page-layout="proxy.$superdoc.activeEditor.pageLayout"
                @page-margins-change="(event) => handleV2PageMarginsChange(doc, event)"
              />
            </div>
          </template>

          <V2SuperEditor
            v-if="doc.type === DOCX && isV2Mode"
            :file-source="doc.data"
            :document-id="doc.id"
            :options="editorOptions(doc)"
            @v2-editor-ready="onV2EditorReady"
            @v2-editor-failed="onV2EditorFailed"
            @v2-render="onV2Render"
            @v2-render-cleared="onV2RenderCleared"
            @v2-render-readiness="onV2RenderReadiness"
            @v2-selection-changed="onV2SelectionChanged"
            @v2-host-event="onV2HostEvent"
            @v2-page-metrics="onV2PageMetrics"
          />

          <!-- omitting field props -->
          <HtmlViewer
            v-if="doc.type === HTML"
            @ready="(id) => handleDocumentReady(id, null)"
            @selection-change="handleSelectionChange"
            :file-source="doc.data"
            :document-id="doc.id"
          />
        </div>
      </div>
    </div>

    <div ref="rightSidebarRef" class="superdoc__right-sidebar right-sidebar" v-if="showCommentsSidebar">
      <div class="floating-comments">
        <FloatingComments
          v-if="hasInitializedLocations && (floatingComments.length > 0 || pendingComment)"
          v-for="doc in documentsWithConverations"
          :parent="layers"
          :current-document="doc"
        />
      </div>
    </div>

    <div v-if="activeCompactComment" class="superdoc__compact-comment-popover" :style="compactCommentPopoverStyle">
      <CommentDialog :comment="activeCompactComment" :parent="layers" />
    </div>

    <!-- AI Writer at cursor position -->
    <!-- ui-phase2-001: hidden in v2 mode — AIWriter calls v1 `editor.commands`. -->
    <div class="ai-writer-container" v-if="showAiWriter && !isV2Mode" :style="aiWriterPosition">
      <AIWriter
        :selected-text="selectedText"
        :handle-close="handleAiWriterClose"
        :editor="proxy.$superdoc.activeEditor"
        :api-key="proxy.$superdoc.toolbar?.config?.aiApiKey"
        :endpoint="proxy.$superdoc.config?.modules?.ai?.endpoint"
      />
    </div>

    <!-- Surface host — generic dialog/floating overlay system -->
    <SurfaceHost :geometry-target="layers" />
  </div>
</template>

<style scoped>
.superdoc {
  display: flex;
  position: relative;
}

.right-sidebar {
  min-width: 320px;
  height: 100%;
}

.floating-comments {
  min-width: 300px;
  width: 300px;
  height: 100%;
  overflow: visible;
}

.superdoc__layers {
  height: 100%;
  position: relative;
  box-sizing: border-box;
}

.superdoc__document {
  width: 100%;
  position: relative;
}

.superdoc__sub-document {
  width: 100%;
  position: relative;
}

.superdoc__selection-layer {
  position: absolute;
  min-width: 100%;
  min-height: 100%;
  z-index: 10;
  pointer-events: none;
}

.superdoc__temp-selection {
  position: absolute;
}

.superdoc__comments-layer {
  /* position: absolute; */
  top: 0;
  height: 100%;
  position: relative;
}

/* In contained mode, overlay layers must not take flow space.
 * With height:100% resolved on .superdoc__document, this element's
 * position:relative + height:100% takes the full container height,
 * pushing .superdoc__sub-document out of view. */
.superdoc--contained .superdoc__comments-layer {
  position: absolute;
  width: 100%;
  pointer-events: none;
}

/* Re-enable pointer events on comment anchors so highlights remain clickable */
.superdoc--contained .sd-comment-anchor {
  pointer-events: auto;
}

.superdoc__right-sidebar {
  width: 320px;
  min-width: 320px;
  padding: 0 10px;
  min-height: 100%;
  position: relative;
  z-index: 2;
}

.superdoc__compact-comment-popover {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 11;
  width: min(320px, calc(100% - 24px));
}

/* Tools styles */
.tools {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: var(--sd-ui-tools-gap, 6px);
}

.tools-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sd-ui-tools-item-size, 50px);
  height: var(--sd-ui-tools-item-size, 50px);
  background-color: var(--sd-ui-tools-item-bg, rgba(219, 219, 219, 0.6));
  border-radius: var(--sd-ui-tools-item-radius, 12px);
  cursor: pointer;
  position: relative;
}

.tools-item i {
  cursor: pointer;
}

.superdoc__tools-icon {
  width: var(--sd-ui-tools-icon-size, 20px);
  height: var(--sd-ui-tools-icon-size, 20px);
  flex-shrink: 0;
}

/* Tools styles - end */

/* .docx {
  border: 1px solid #dfdfdf;
  pointer-events: auto;
} */

/* 834px is iPad screen size in portrait orientation */
@media (max-width: 834px) {
  .superdoc .superdoc__layers {
    margin: 0;
    border: 0 !important;
    box-shadow: none;
  }

  .superdoc__sub-document {
    max-width: 100%;
  }

  .superdoc__right-sidebar {
    padding: 10px;
    position: relative;
  }
}

/* AI Writer styles */
.ai-writer-container {
  position: fixed;
  z-index: 1000;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

/* Remove the AI Sidebar styles */
/* .ai-sidebar-container {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
} */

.ai-tool > svg {
  fill: transparent;
}

.ai-tool::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;

  z-index: 1;
  background: linear-gradient(
    270deg,
    rgba(218, 215, 118, 0.5) -20%,
    rgba(191, 100, 100, 1) 30%,
    rgba(77, 82, 217, 1) 60%,
    rgb(255, 219, 102) 150%
  );
  -webkit-mask: url("data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><path d='M224 96l16-32 32-16-32-16-16-32-16 32-32 16 32 16 16 32zM80 160l26.7-53.3L160 80l-53.3-26.7L80 0 53.3 53.3 0 80l53.3 26.7L80 160zm352 128l-26.7 53.3L352 368l53.3 26.7L432 448l26.7-53.3L512 368l-53.3-26.7L432 288zm70.6-193.8L417.8 9.4C411.5 3.1 403.3 0 395.2 0c-8.2 0-16.4 3.1-22.6 9.4L9.4 372.5c-12.5 12.5-12.5 32.8 0 45.3l84.9 84.9c6.3 6.3 14.4 9.4 22.6 9.4 8.2 0 16.4-3.1 22.6-9.4l363.1-363.2c12.5-12.5 12.5-32.8 0-45.2zM359.5 203.5l-50.9-50.9 86.6-86.6 50.9 50.9-86.6 86.6z'/></svg>")
    center / contain no-repeat;
  mask: url("data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><path d='M224 96l16-32 32-16-32-16-16-32-16 32-32 16 32 16 16 32zM80 160l26.7-53.3L160 80l-53.3-26.7L80 0 53.3 53.3 0 80l53.3 26.7L80 160zm352 128l-26.7 53.3L352 368l53.3 26.7L432 448l26.7-53.3L512 368l-53.3-26.7L432 288zm70.6-193.8L417.8 9.4C411.5 3.1 403.3 0 395.2 0c-8.2 0-16.4 3.1-22.6 9.4L9.4 372.5c-12.5 12.5-12.5 32.8 0 45.3l84.9 84.9c6.3 6.3 14.4 9.4 22.6 9.4 8.2 0 16.4-3.1 22.6-9.4l363.1-363.2c12.5-12.5 12.5-32.8 0-45.2zM359.5 203.5l-50.9-50.9 86.6-86.6 50.9 50.9-86.6 86.6z'/></svg>")
    center / contain no-repeat;
  filter: brightness(1.2);
  transition: filter 0.2s ease;
}

.ai-tool:hover::before {
  filter: brightness(1.3);
}

/* Tools styles - end */
</style>
