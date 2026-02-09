<script setup>
import '@superdoc/common/styles/common-styles.css';
import '@superdoc/super-editor/style.css';

import { superdocIcons } from './icons.js';
//prettier-ignore
import {
  getCurrentInstance,
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
  computed,
  reactive,
  watch,
  defineAsyncComponent,
} from 'vue';
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import { storeToRefs } from 'pinia';

import CommentsLayer from './components/CommentsLayer/CommentsLayer.vue';
import CommentDialog from '@superdoc/components/CommentsLayer/CommentDialog.vue';
import FloatingComments from '@superdoc/components/CommentsLayer/FloatingComments.vue';
import HrbrFieldsLayer from '@superdoc/components/HrbrFieldsLayer/HrbrFieldsLayer.vue';
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
import { useUiFontFamily } from './composables/useUiFontFamily.js';

const PdfViewer = defineAsyncComponent(() => import('./components/PdfViewer/PdfViewer.vue'));

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
  addComment,
  getComment,
  COMMENT_EVENTS,
} = commentsStore;
const { proxy } = getCurrentInstance();
commentsStore.proxy = proxy;

const { isHighContrastMode } = useHighContrastMode();
const { uiFontFamily } = useUiFontFamily();

const isViewingMode = () => proxy?.$superdoc?.config?.documentMode === 'viewing';
const isViewingCommentsVisible = computed(
  () => isViewingMode() && proxy?.$superdoc?.config?.comments?.visible === true,
);
const isViewingTrackChangesVisible = computed(
  () => isViewingMode() && proxy?.$superdoc?.config?.trackChanges?.visible === true,
);
const shouldRenderCommentsInViewing = computed(() => {
  if (!isViewingMode()) return true;
  return isViewingCommentsVisible.value || isViewingTrackChangesVisible.value;
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
    vars['--sd-comment-highlight-hover'] = commentsConfig.highlightHoverColor;
  }

  const trackChangeColors = commentsConfig.trackChangeHighlightColors || {};
  const activeTrackChangeColors = {
    ...trackChangeColors,
    ...(commentsConfig.trackChangeActiveHighlightColors || {}),
  };
  if (activeTrackChangeColors.insertBorder) vars['--sd-track-insert-border'] = activeTrackChangeColors.insertBorder;
  if (activeTrackChangeColors.insertBackground) vars['--sd-track-insert-bg'] = activeTrackChangeColors.insertBackground;
  if (activeTrackChangeColors.deleteBorder) vars['--sd-track-delete-border'] = activeTrackChangeColors.deleteBorder;
  if (activeTrackChangeColors.deleteBackground) vars['--sd-track-delete-bg'] = activeTrackChangeColors.deleteBackground;
  if (activeTrackChangeColors.formatBorder) vars['--sd-track-format-border'] = activeTrackChangeColors.formatBorder;

  return vars;
});

// Refs
const layers = ref(null);

// Comments layer
const commentsLayer = ref(null);
const toolsMenuPosition = reactive({ top: null, right: '-25px', zIndex: 101 });

// Create a ref to pass to the composable
const activeEditorRef = computed(() => proxy.$superdoc.activeEditor);

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

const handleToolClick = (tool) => {
  const toolOptions = {
    comments: () => showAddComment(proxy.$superdoc),
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
  if (e.target.classList.contains('n-dropdown-option-body__label')) return;
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
    doc.setPresentationEditor(presentationEditor);
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

const onEditorUpdate = ({ editor }) => {
  proxy.$superdoc.emit('editor-update', { editor });
};

const onEditorSelectionChange = ({ editor, transaction }) => {
  if (skipSelectionUpdate.value) {
    // When comment is added selection will be equal to comment text
    // Should skip calculations to keep text selection for comments correct
    skipSelectionUpdate.value = false;
    if (isViewingMode()) {
      resetSelection();
    }
    return;
  }

  if (isViewingMode()) {
    resetSelection();
    return;
  }

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

const onEditorException = ({ error, editor }) => {
  proxy.$superdoc.emit('exception', { error, editor });
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
  const ydocMeta = doc.ydoc?.getMap?.('meta');
  const ydocHasContent = (ydocFragment && ydocFragment.length > 0) || (ydocMeta && Boolean(ydocMeta.get('docx')));
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
    rulers: doc.rulers,
    rulerContainer: proxy.$superdoc.config.rulerContainer,
    isInternal: proxy.$superdoc.config.isInternal,
    annotations: proxy.$superdoc.config.annotations,
    isCommentsEnabled: Boolean(commentsModuleConfig.value),
    isAiEnabled: proxy.$superdoc.config.modules?.ai,
    slashMenuConfig: proxy.$superdoc.config.modules?.slashMenu,
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
    onException: onEditorException,
    onCommentsLoaded,
    onCommentsUpdate: onEditorCommentsUpdate,
    onCommentLocationsUpdate: (payload) => onEditorCommentLocationsUpdate(doc, payload),
    onListDefinitionsChange: onEditorListdefinitionsChange,
    onFontsResolved: onFontsResolvedFn,
    onTransaction: onEditorTransaction,
    ydoc: doc.ydoc,
    collaborationProvider: doc.provider || null,
    isNewFile,
    handleImageUpload: proxy.$superdoc.config.handleImageUpload,
    externalExtensions: proxy.$superdoc.config.editorExtensions || [],
    suppressDefaultDocxStyles: proxy.$superdoc.config.suppressDefaultDocxStyles,
    disableContextMenu: proxy.$superdoc.config.disableContextMenu,
    jsonOverride: proxy.$superdoc.config.jsonOverride,
    viewOptions: proxy.$superdoc.config.viewOptions,
    layoutEngineOptions: useLayoutEngine
      ? {
          ...(proxy.$superdoc.config.layoutEngineOptions || {}),
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
    return;
  }

  // Layout engine mode: map PM positions to visual layout coordinates.
  // Note: PresentationEditor's 'commentPositions' event provides fresh positions
  // after every layout, so this is mainly for the initial load before layout completes.
  const mappedPositions = presentation.getCommentBounds(allCommentPositions, layers.value);
  handleEditorLocationsUpdate(mappedPositions, activeThreadId);
};

const onEditorCommentsUpdate = (params = {}) => {
  // Set the active comment in the store
  let { activeCommentId, type, comment: commentPayload } = params;

  if (COMMENT_EVENTS?.ADD && type === COMMENT_EVENTS.ADD && commentPayload) {
    if (!commentPayload.commentText && commentPayload.text) {
      commentPayload.commentText = commentPayload.text;
    }

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

    const id = commentPayload.commentId || commentPayload.importedId;
    if (id && !getComment(id)) {
      const commentModel = useComment(commentPayload);
      addComment({ superdoc: proxy.$superdoc, comment: commentModel, skipEditorUpdate: true });
    }

    if (!activeCommentId && id) {
      activeCommentId = id;
    }
  }

  if (type === 'trackedChange') {
    handleTrackedChangeUpdate({ superdoc: proxy.$superdoc, params });
  }

  nextTick(() => {
    if (pendingComment.value) return;
    commentsStore.setActiveComment(proxy.$superdoc, activeCommentId);
    isCommentHighlighted.value = true;
  });

  // Bubble up the event to the user, if handled
  if (typeof proxy.$superdoc.config.onCommentsUpdate === 'function') {
    proxy.$superdoc.config.onCommentsUpdate(params);
  }
};

const onEditorTransaction = ({ editor, transaction, duration }) => {
  if (typeof proxy.$superdoc.config.onTransaction === 'function') {
    proxy.$superdoc.config.onTransaction({ editor, transaction, duration });
  }
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
  const commentsConfig = proxy.$superdoc.config?.modules?.comments;
  if (!commentsConfig || commentsConfig === false) return;

  const element = document.querySelector(`[data-thread-id=${commentId}]`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    commentsStore.setActiveComment(proxy.$superdoc, commentId);
  }
};

onMounted(() => {
  const config = commentsModuleConfig.value;
  if (config && !config.readOnly) {
    document.addEventListener('mousedown', handleDocumentMouseDown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
});

const selectionLayer = ref(null);
const isDragging = ref(false);

const getSelectionPosition = computed(() => {
  if (!selectionPosition.value || selectionPosition.value.source === 'super-editor') {
    return { x: null, y: null };
  }

  const top = selectionPosition.value.top;
  const left = selectionPosition.value.left;
  const right = selectionPosition.value.right;
  const bottom = selectionPosition.value.bottom;
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
  if (isViewingMode()) {
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
  let top = selection.selectionBounds.top;
  toolsMenuPosition.top = top + 'px';
  toolsMenuPosition.right = isMobileView ? '0' : '-25px';
};

const resetSelection = () => {
  selectionPosition.value = null;
  toolsMenuPosition.top = null;
};

const updateSelection = ({ startX, startY, x, y, source }) => {
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

const handleSelectionStart = (e) => {
  resetSelection();
  selectionLayer.value.style.pointerEvents = 'auto';

  nextTick(() => {
    isDragging.value = true;
    const y = e.offsetY / (activeZoom.value / 100);
    const x = e.offsetX / (activeZoom.value / 100);
    updateSelection({ startX: x, startY: y });
    selectionLayer.value.addEventListener('mousemove', handleDragMove);
  });
};

const handleDragMove = (e) => {
  if (!isDragging.value) return;
  const y = e.offsetY / (activeZoom.value / 100);
  const x = e.offsetX / (activeZoom.value / 100);
  updateSelection({ x, y });
};

const handleDragEnd = (e) => {
  if (!isDragging.value) return;
  selectionLayer.value.removeEventListener('mousemove', handleDragMove);

  if (!selectionPosition.value) return;
  const selection = useSelection({
    selectionBounds: {
      top: selectionPosition.value.top,
      left: selectionPosition.value.left,
      right: selectionPosition.value.right,
      bottom: selectionPosition.value.bottom,
    },
    documentId: documents.value[0].id,
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

watch(
  () => activeZoom.value,
  (zoom) => {
    if (proxy.$superdoc.config.useLayoutEngine !== false) {
      PresentationEditor.setGlobalZoom((zoom ?? 100) / 100);
    }
  },
);

watch(getFloatingComments, () => {
  hasInitializedLocations.value = false;
  nextTick(() => {
    hasInitializedLocations.value = true;
  });
});
</script>

<template>
  <n-config-provider abstract preflight-style-disabled>
    <div
      class="superdoc"
      :class="{
        'superdoc--with-sidebar': showCommentsSidebar,
        'superdoc--web-layout': proxy.$superdoc.config.viewOptions?.layout === 'web',
        'high-contrast': isHighContrastMode,
      }"
      :style="superdocStyleVars"
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

          <div class="superdoc__sub-document sub-document" v-for="doc in documents" :key="doc.id">
            <!-- PDF renderer -->

            <PdfViewer
              v-if="doc.type === PDF"
              :document-data="doc"
              :config="pdfConfig"
              @selection-change="handleSelectionChange"
              @ready="handleDocumentReady"
              @page-loaded="handlePageReady"
              @bypass-selection="handlePdfClick"
            />

            <n-message-provider>
              <SuperEditor
                v-if="doc.type === DOCX"
                :file-source="doc.data"
                :state="doc.state"
                :document-id="doc.id"
                :options="{ ...editorOptions(doc), rulers: doc.rulers }"
                @editor-ready="onEditorReady"
                @pageMarginsChange="handleSuperEditorPageMarginsChange(doc, $event)"
              />
            </n-message-provider>

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
        <CommentDialog
          v-if="pendingComment"
          :comment="pendingComment"
          :auto-focus="true"
          :is-floating="true"
          v-click-outside="cancelPendingComment"
        />

        <div class="floating-comments">
          <FloatingComments
            v-if="hasInitializedLocations && getFloatingComments.length > 0"
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
    </div>
  </n-config-provider>
</template>

<style scoped>
.superdoc {
  display: flex;
}

.right-sidebar {
  min-width: 320px;
}

.floating-comments {
  min-width: 300px;
  width: 300px;
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
  gap: 6px;
}

.tools .tool-icon {
  font-size: 20px;
  border-radius: 12px;
  border: none;
  outline: none;
  background-color: #dbdbdb;
  cursor: pointer;
}

.tools-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  background-color: rgba(219, 219, 219, 0.6);
  border-radius: 12px;
  cursor: pointer;
}

.tools-item i {
  cursor: pointer;
}

.superdoc__tools-icon {
  width: 20px;
  height: 20px;
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

/* Tools styles */
.tools {
  position: absolute;
  z-index: 3;
  display: flex;
  gap: 6px;
}

.tools .tool-icon {
  font-size: 20px;
  border-radius: 12px;
  border: none;
  outline: none;
  background-color: #dbdbdb;
  cursor: pointer;
}

.tools-item {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 50px;
  height: 50px;
  background-color: rgba(219, 219, 219, 0.6);
  border-radius: 12px;
  cursor: pointer;
}

.tools-item i {
  cursor: pointer;
}

.superdoc__tools-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

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
