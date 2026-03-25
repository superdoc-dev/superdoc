<script setup>
import '@superdoc/common/styles/common-styles.css';
import '@superdoc/super-editor/style.css';

import { superdocIcons } from './icons.js';
//prettier-ignore
import {
  getCurrentInstance,
  inject,
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
  computed,
  reactive,
  watch,
  defineAsyncComponent,
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
import { SuperEditor, AIWriter, PresentationEditor } from '@superdoc/super-editor';
import HtmlViewer from './components/HtmlViewer/HtmlViewer.vue';
import useComment from './components/CommentsLayer/use-comment';
import AiLayer from './components/AiLayer/AiLayer.vue';
import { useSelectedText } from './composables/use-selected-text';
import { useAi } from './composables/use-ai';
import { useHighContrastMode } from './composables/use-high-contrast-mode';
import { getVisibleThreadAnchorClientY } from './helpers/comment-focus.js';
import { useUiFontFamily } from './composables/useUiFontFamily.js';
import { usePasswordPrompt } from './composables/use-password-prompt.js';
import { useFindReplace } from './composables/use-find-replace.js';
import SurfaceHost from './components/surfaces/SurfaceHost.vue';

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
  getFloatingComments,
  hasSyncedCollaborationComments,
  editorCommentPositions,
  hasInitializedLocations,
  isCommentHighlighted,
} = storeToRefs(commentsStore);
const {
  showAddComment,
  handleEditorLocationsUpdate,
  handleTrackedChangeUpdate,
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
const pdfViewerRef = ref(null);
const pendingReplayTrackedChangeSync = ref(false);

// Comments layer
const commentsLayer = ref(null);
const toolsMenuPosition = reactive({ top: null, right: '-25px', zIndex: 101 });

// Create a ref to pass to the composable
const activeEditorRef = computed(() => proxy.$superdoc.activeEditor);

// Find/replace controller — uses surfaces to show a floating find/replace popover.
const findReplace = useFindReplace({
  getSurfaceManager: () => surfaceManager,
  getActiveEditor: () => proxy.$superdoc?.activeEditor,
  activeEditorRef,
  getFindReplaceConfig: () => proxy.$superdoc?.config?.modules?.surfaces?.findReplace,
});

// Use the composable to get the selected text
const { selectedText } = useSelectedText(activeEditorRef);

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

// Hrbr Fields
const hrbrFieldsLayer = ref(null);

const pdfConfig = proxy.$superdoc.config.modules?.pdf || {};

const flushPendingReplayTrackedChangeSync = () => {
  if (!pendingReplayTrackedChangeSync.value) return;
  pendingReplayTrackedChangeSync.value = false;
  syncTrackedChangeComments({ superdoc: proxy.$superdoc, editor: proxy.$superdoc?.activeEditor });
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

const handleToolClick = (tool) => {
  const toolOptions = {
    comments: () => showAddComment(proxy.$superdoc, getPendingCommentTargetClientY()),
    ai: () => handleAiToolClick(),
  };

  if (tool in toolOptions) {
    toolOptions[tool](activeSelection.value, selectionPosition.value);
  }

  activeSelection.value = null;
  toolsMenuPosition.top = null;
};

const handleDocumentMouseDown = (e) => {
  if (pendingComment.value) return;
};

const handleHighlightClick = () => (toolsMenuPosition.top = null);
const cancelPendingComment = (e) => {
  if (e.target.classList.contains('comments-dropdown__option-label')) return;
  commentsStore.removePendingComment(proxy.$superdoc);
};

const onCommentsLoaded = ({ editor, comments, replacedFile }) => {
  if (editor.options.shouldLoadComments || replacedFile) {
    nextTick(() => {
      commentsStore.processLoadedDocxComments({
        superdoc: proxy.$superdoc,
        editor,
        comments,
        documentId: editor.options.documentId,
      });
    });
  }
};

const onEditorBeforeCreate = ({ editor }) => {
  proxy.$superdoc?.broadcastEditorBeforeCreate(editor);
};

const onEditorCreate = ({ editor }) => {
  const { documentId } = editor.options;
  const doc = getDocument(documentId);
  doc.setEditor(editor);
  proxy.$superdoc.setActiveEditor(editor);
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
  presentationEditor.setContextMenuDisabled?.(proxy.$superdoc.config.disableContextMenu);

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

const onEditorFocus = ({ editor }) => {
  proxy.$superdoc.setActiveEditor(editor);
};

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

function getSelectionBoundingBox() {
  const selection = window.getSelection();

  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    return range.getBoundingClientRect();
  }

  return null;
}

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
  'deletedText',
  'resolvedTime',
  'resolvedByEmail',
  'resolvedByName',
  'importedAuthor',
  'docxCommentJSON',
]);

const applyReplayIsDoneResolutionFallback = (target, payload = {}) => {
  if (!target || payload.isDone === undefined) return;
  if (payload.resolvedTime != null || payload.resolvedByEmail != null || payload.resolvedByName != null) return;

  // Imported replay payloads often use `isDone` while resolved fields remain null.
  // When resolved fields are not explicitly populated, derive sidebar/export state from `isDone`.
  if (payload.isDone) {
    target.resolvedTime = target.resolvedTime || Date.now();
    target.resolvedByEmail = target.resolvedByEmail || payload.creatorEmail || null;
    target.resolvedByName = target.resolvedByName || payload.creatorName || null;
    return;
  }

  target.resolvedTime = null;
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

const onEditorTransaction = (payload = {}) => {
  const { editor, transaction } = payload;
  const inputType = transaction?.getMeta?.('inputType');

  // Call sync on editor transaction but only if it's undo or redo
  // This could be extended to other listeners in the future
  if (inputType === 'historyUndo' || inputType === 'historyRedo') {
    const documentId = editor?.options?.documentId;
    syncTrackedChangePositionsWithDocument({ documentId, editor });
    syncTrackedChangeComments({ superdoc: proxy.$superdoc, editor });
  }

  emitEditorTransaction(buildEditorTransactionPayload(payload));
};

const isCommentsEnabled = computed(() => Boolean(commentsModuleConfig.value));
const showCommentsSidebar = computed(() => {
  if (!shouldRenderCommentsInViewing.value) return false;
  return (
    pendingComment.value ||
    (getFloatingComments.value?.length > 0 &&
      isReady.value &&
      layers.value &&
      isCommentsEnabled.value &&
      !isCommentsListVisible.value)
  );
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

/**
 * Scroll the page to a given commentId
 *
 * @param {String} commentId The commentId to scroll to
 */
const scrollToComment = (commentId) => {
  proxy.$superdoc.scrollToComment(commentId);
};

onMounted(() => {
  const config = commentsModuleConfig.value;
  if (config && !config.readOnly) {
    document.addEventListener('mousedown', handleDocumentMouseDown);
  }
  document.addEventListener('keydown', handleFindShortcut, true);
});

/**
 * Handle Cmd+F / Ctrl+F to open find/replace instead of browser find.
 * Use a document-level capture listener because the dev shell and
 * presentation-mode bridge do not always leave keyboard focus on a node
 * that bubbles through the .superdoc root.
 */
function isFindShortcutEvent(e) {
  return (e.metaKey || e.ctrlKey) && !e.altKey && e.key?.toLowerCase?.() === 'f';
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
  if (!isFocusInsideSuperDoc()) return;

  // Only steal the shortcut if the composable will actually open a surface.
  // If the resolver returns { type: 'none' }, we must let the browser handle Cmd+F.
  if (!findReplace.wouldOpen()) return;

  e.preventDefault();
  e.stopPropagation();
  findReplace.open();
}

function handleContainerKeydown(e) {
  handleFindShortcut(e);
}

onBeforeUnmount(() => {
  passwordPrompt.destroy();
  findReplace.destroy();
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  document.removeEventListener('keydown', handleFindShortcut, true);
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
    selectionLayer.value.style.pointerEvents = 'none';
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

watch(
  () => activeZoom.value,
  (zoom) => {
    const zoomFactor = (zoom ?? 100) / 100;

    if (proxy.$superdoc.config.useLayoutEngine !== false) {
      PresentationEditor.setGlobalZoom(zoomFactor);
    } else {
      // Web layout without layout engine — apply CSS transform directly
      // to non-PDF sub-document containers so zoom works for PM fallback rendering.
      // PDF documents are excluded because pdfViewer.updateScale() handles their zoom
      // separately below; applying both would result in double-zoom.
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
watch(getFloatingComments, () => {
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
      <div v-if="showToolsFloatingMenu" class="superdoc__tools tools" :style="toolsMenuPosition">
        <div class="tools-item" data-id="is-tool" @mousedown.stop.prevent="handleToolClick('comments')">
          <div class="superdoc__tools-icon" v-html="superdocIcons.comment"></div>
        </div>
        <!-- AI tool button -->
        <div
          v-if="proxy.$superdoc.config.modules.ai"
          class="tools-item"
          data-id="is-tool"
          @mousedown.stop.prevent="handleToolClick('ai')"
        >
          <div class="superdoc__tools-icon ai-tool"></div>
        </div>
      </div>

      <div class="superdoc__document document">
        <div
          v-if="isCommentsEnabled"
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

        <!-- Fields layer -->
        <HrbrFieldsLayer
          v-if="'hrbr-fields' in modules && layers"
          :fields="modules['hrbr-fields']"
          class="superdoc__comments-layer comments-layer"
          style="z-index: 2"
          ref="hrbrFieldsLayer"
        />

        <!-- On-document comments layer -->
        <CommentsLayer
          v-if="layers"
          class="superdoc__comments-layer comments-layer"
          style="z-index: 3"
          ref="commentsLayer"
          :parent="layers"
          :user="user"
          @highlight-click="handleHighlightClick"
        />

        <!-- AI Layer for temporary highlights -->
        <AiLayer
          v-if="showAiLayer"
          class="ai-layer"
          style="z-index: 4"
          ref="aiLayer"
          :editor="proxy.$superdoc.activeEditor"
        />

        <!-- Whiteboard Layer -->
        <WhiteboardLayer
          v-if="layers && whiteboardModuleConfig"
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
        >
          <!-- PDF renderer -->
          <PdfViewer
            v-if="doc.type === PDF"
            :file="doc.data"
            :file-id="doc.id"
            :config="pdfConfig"
            @selection-raw="handlePdfSelectionRaw"
            @bypass-selection="handlePdfClick"
            @page-rendered="handleWhiteboardPageReady"
            @document-ready="({ documentId, viewerContainer }) => handleDocumentReady(documentId, viewerContainer)"
            ref="pdfViewerRef"
          />

          <SuperEditor
            v-if="doc.type === DOCX"
            :file-source="doc.data"
            :state="doc.state"
            :document-id="doc.id"
            :options="{ ...editorOptions(doc), rulers: doc.rulers }"
            @editor-ready="onEditorReady"
            @pageMarginsChange="handleSuperEditorPageMarginsChange(doc, $event)"
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

    <div class="superdoc__right-sidebar right-sidebar" v-if="showCommentsSidebar">
      <div class="floating-comments">
        <FloatingComments
          v-if="hasInitializedLocations && (getFloatingComments.length > 0 || pendingComment)"
          v-for="doc in documentsWithConverations"
          :parent="layers"
          :current-document="doc"
        />
      </div>
    </div>

    <!-- AI Writer at cursor position -->
    <div class="ai-writer-container" v-if="showAiWriter" :style="aiWriterPosition">
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
  overflow-y: hidden;
  overflow-x: hidden;
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
    width: 55px;
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
