import { defineStore } from 'pinia';
import { ref, reactive, computed, watch } from 'vue';
import { comments_module_events } from '@superdoc/common';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import { syncCommentsToClients } from '../core/collaboration/helpers.js';
import {
  Editor,
  trackChangesHelpers,
  CommentsPluginKey,
  getRichTextExtensions,
  createOrUpdateTrackedChangeComment,
} from '@superdoc/super-editor';
import useComment from '@superdoc/components/CommentsLayer/use-comment';
import { groupChanges } from '../helpers/group-changes.js';

export const useCommentsStore = defineStore('comments', () => {
  const superdocStore = useSuperdocStore();
  const commentsConfig = reactive({
    name: 'comments',
    readOnly: false,
    allowResolve: true,
    showResolved: false,
  });
  const viewingVisibility = reactive({
    documentMode: 'editing',
    commentsVisible: false,
    trackChangesVisible: false,
  });

  const isDebugging = false;
  const debounceTimers = {};
  const trackedChangeResolutionSnapshots = new WeakMap();

  const COMMENT_EVENTS = comments_module_events;
  const hasInitializedComments = ref(false);
  const hasSyncedCollaborationComments = ref(false);
  const commentsParentElement = ref(null);
  const hasInitializedLocations = ref(false);
  const activeComment = ref(null);
  const editingCommentId = ref(null);
  const commentDialogs = ref([]);
  const overlappingComments = ref([]);
  const overlappedIds = new Set([]);
  const suppressInternalExternal = ref(true);
  const currentCommentText = ref('');
  const commentsList = ref([]);
  const isCommentsListVisible = ref(false);
  const editorCommentIds = ref([]);
  const editorCommentPositions = ref({});
  const isCommentHighlighted = ref(false);

  // Floating comments
  const floatingCommentsOffset = ref(0);
  const sortedConversations = ref([]);
  const visibleConversations = ref([]);
  const skipSelectionUpdate = ref(false);
  const isFloatingCommentsReady = ref(false);
  const generalCommentIds = ref([]);
  const instantSidebarAlignmentTargetY = ref(null);

  const pendingComment = ref(null);
  const isViewingMode = computed(() => viewingVisibility.documentMode === 'viewing');

  /**
   * Initialize the store
   *
   * @param {Object} config The comments module config from SuperDoc
   * @returns {void}
   */
  const init = (config = {}) => {
    const updatedConfig = { ...commentsConfig, ...config };
    Object.assign(commentsConfig, updatedConfig);

    suppressInternalExternal.value = commentsConfig.suppressInternalExternal || false;

    // Map initial comments state
    if (config.comments && config.comments.length) {
      commentsList.value = config.comments?.map((c) => useComment(c)) || [];
    }
  };

  /**
   * Get a comment by either ID or imported ID
   *
   * @param {string} id The comment ID
   * @returns {Object} The comment object
   */
  const getComment = (id) => {
    if (id === undefined || id === null) return null;
    return commentsList.value.find((c) => c.commentId == id || c.importedId == id);
  };

  const getThreadParent = (comment) => {
    if (!comment?.parentCommentId) return comment;
    return getComment(comment.parentCommentId);
  };

  const isRangeThreadedComment = (comment) => {
    if (!comment) return false;
    return (
      comment.threadingStyleOverride === 'range-based' ||
      comment.threadingMethod === 'range-based' ||
      comment.originalXmlStructure?.hasCommentsExtended === false
    );
  };

  const shouldThreadWithTrackedChange = (comment) => {
    if (!comment?.trackedChangeParentId) return false;
    if (!isRangeThreadedComment(comment)) return false;
    const trackedChange = getComment(comment.trackedChangeParentId);
    return Boolean(trackedChange?.trackedChange);
  };

  /**
   * Extract the position lookup key from a comment or comment ID.
   * Prefers whichever key currently exists in editorCommentPositions.
   *
   * @param {Object | string | null | undefined} commentOrId The comment object or comment ID
   * @returns {string | null} The position key
   */
  const getCommentPositionKey = (commentOrId) => {
    if (!commentOrId) return null;

    const positions = editorCommentPositions.value || {};

    if (typeof commentOrId === 'string') {
      if (positions[commentOrId]) {
        return commentOrId;
      }

      const resolvedComment = getComment(commentOrId);
      if (!resolvedComment) {
        return commentOrId;
      }

      const commentId = resolvedComment.commentId ?? null;
      const importedId = resolvedComment.importedId ?? null;
      if (commentId && positions[commentId]) return commentId;
      if (importedId && positions[importedId]) return importedId;
      return commentId ?? importedId ?? null;
    }

    const commentId = commentOrId.commentId ?? null;
    const importedId = commentOrId.importedId ?? null;
    if (commentId && positions[commentId]) return commentId;
    if (importedId && positions[importedId]) return importedId;
    return commentId ?? importedId ?? null;
  };

  const normalizeCommentId = (id) => (id === undefined || id === null ? null : String(id));

  // Comments can be referenced by the imported DOCX id, the internal commentId, or a raw id
  // coming from UI/editor events. Normalize everything to strings and keep all aliases so every
  // lookup path resolves against the same set of ids.
  const getCommentAliasIds = (commentOrId) => {
    if (commentOrId === undefined || commentOrId === null) return [];

    const rawId = typeof commentOrId === 'object' ? null : commentOrId;
    const comment = typeof commentOrId === 'object' ? commentOrId : getComment(commentOrId);
    const seen = new Set();

    return [rawId, getCommentPositionKey(comment), comment?.commentId, comment?.importedId]
      .map((id) => normalizeCommentId(id))
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  };

  const resolveCommentPositionEntry = (commentOrId, preferredId) => {
    const currentPositions = editorCommentPositions.value || {};
    const seen = new Set();

    for (const key of [preferredId, ...getCommentAliasIds(commentOrId)]
      .map((id) => normalizeCommentId(id))
      .filter(Boolean)) {
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = currentPositions[key];
      if (entry !== undefined) {
        return { key, entry };
      }
    }

    return { key: null, entry: null };
  };

  const clearResolvedMetadata = (comment) => {
    if (!comment) return;
    if (
      comment.resolvedTime !== undefined ||
      comment.resolvedByEmail !== undefined ||
      comment.resolvedByName !== undefined
    ) {
      trackedChangeResolutionSnapshots.set(comment, {
        resolvedTime: comment.resolvedTime ?? null,
        resolvedByEmail: comment.resolvedByEmail ?? null,
        resolvedByName: comment.resolvedByName ?? null,
      });
    }
    // Sets the resolved state to null so it can be restored in the comments sidebar
    comment.resolvedTime = null;
    comment.resolvedByEmail = null;
    comment.resolvedByName = null;
  };

  const getCommentEventPayload = (comment) =>
    typeof comment?.getValues === 'function' ? comment.getValues() : { ...comment };

  /**
   * Check if a comment originated from the super-editor (or has no explicit source).
   * Comments without a source are assumed to be editor-backed for backward compatibility.
   *
   * @param {Object} comment - The comment to check
   * @returns {boolean} True if the comment is editor-backed
   */
  const isEditorBackedComment = (comment) => {
    const source = comment?.selection?.source;
    if (source == null) return true;
    return source === 'super-editor';
  };

  const isTrackedChangeThread = (comment) => Boolean(comment?.trackedChange) || Boolean(comment?.trackedChangeParentId);

  const syncTrackedChangePositionsWithDocument = ({ documentId, editor } = {}) => {
    // Keep editor-driven comment anchors in sync with live tracked-change marks
    if (!editor?.state) return 0;
    if (!commentsList.value?.length) return 0;

    const currentPositions = editorCommentPositions.value || {};
    if (!Object.keys(currentPositions).length) return 0;

    // Which position key is currently in use (first alias present in currentPositions)
    const resolveExistingPositionKey = (aliasIds) =>
      aliasIds.find((key) => currentPositions[key] !== undefined) ?? null;

    // First pass: find tracked-change root comments that still have positions in this document
    const candidateRootPositionKeys = new Set();
    const rootAliasesByPositionKey = new Map();

    commentsList.value.forEach((comment) => {
      if (!comment?.trackedChange) return;
      if (documentId) {
        const resolvedDocumentId = comment?.fileId ?? null;
        if (resolvedDocumentId && resolvedDocumentId !== documentId) return;
      }

      const aliasIds = getCommentAliasIds(comment);
      const normalizedPositionKey = resolveExistingPositionKey(aliasIds);
      if (!normalizedPositionKey) return;

      candidateRootPositionKeys.add(normalizedPositionKey);
      rootAliasesByPositionKey.set(normalizedPositionKey, new Set(aliasIds));
    });

    if (!candidateRootPositionKeys.size) return 0;

    // Collect IDs for all currently active tracked-change marks in the document
    const trackedIds = new Set(
      trackChangesHelpers
        .getTrackChanges(editor.state)
        .map(({ mark }) => mark?.attrs?.id)
        .filter((id) => id !== undefined && id !== null)
        .map((id) => String(id)),
    );
    // Any tracked-change roots whose aliases are missing from document marks are considered stale
    const staleRootPositionKeys = new Set(
      Array.from(candidateRootPositionKeys).filter((positionKey) => {
        const aliases = rootAliasesByPositionKey.get(positionKey) ?? new Set([positionKey]);
        // Keep stale detection aligned with editorCommentPositions by matching against whichever
        // alias key (commentId/importedId) is currently present in the live position map.
        return !Array.from(aliases).some((alias) => trackedIds.has(alias));
      }),
    );
    if (!staleRootPositionKeys.size) return 0;

    const staleRootAliasIds = new Set();
    staleRootPositionKeys.forEach((positionKey) => {
      const aliases = rootAliasesByPositionKey.get(positionKey) ?? new Set([positionKey]);
      aliases.forEach((alias) => staleRootAliasIds.add(alias));
    });

    const stalePositionKeys = new Set(staleRootPositionKeys);

    commentsList.value.forEach((comment) => {
      const aliasIds = getCommentAliasIds(comment);
      const normalizedPositionKey = resolveExistingPositionKey(aliasIds);
      if (!normalizedPositionKey) return;

      // Extend staleness to replies / child comments that thread under a stale tracked-change root
      const parentKeys = [comment?.trackedChangeParentId, comment?.parentCommentId]
        .map((id) => normalizeCommentId(id))
        .filter(Boolean);

      if (parentKeys.some((id) => staleRootAliasIds.has(id))) {
        stalePositionKeys.add(normalizedPositionKey);
      }
    });

    const nextPositions = { ...currentPositions };
    stalePositionKeys.forEach((key) => {
      delete nextPositions[key];
    });
    editorCommentPositions.value = nextPositions;

    if (activeComment.value !== undefined && activeComment.value !== null) {
      const activeCommentModel = getComment(activeComment.value);
      const activeAliases = new Set(getCommentAliasIds(activeCommentModel ?? activeComment.value));
      // If the active comment is part of a stale tracked-change thread, clear the active state
      const activeParentKeys = [activeCommentModel?.trackedChangeParentId, activeCommentModel?.parentCommentId]
        .map((id) => normalizeCommentId(id))
        .filter(Boolean);

      const isActiveStale = Array.from(activeAliases).some((id) => staleRootAliasIds.has(id));
      if (isActiveStale || activeParentKeys.some((id) => staleRootAliasIds.has(id))) {
        activeComment.value = null;
      }
    }

    return stalePositionKeys.size;
  };

  const syncResolvedCommentsWithDocument = () => {
    const docPositions = editorCommentPositions.value || {};
    const activeKeys = new Set(Object.keys(docPositions));
    if (!activeKeys.size) return;

    commentsList.value.forEach((comment) => {
      const { key } = resolveCommentPositionEntry(comment);
      if (!key) return;

      const hasActiveAnchor = activeKeys.has(String(key));
      if (
        hasActiveAnchor &&
        comment.resolvedTime &&
        isEditorBackedComment(comment) &&
        !isTrackedChangeThread(comment)
      ) {
        clearResolvedMetadata(comment);
      }
    });
  };

  /* The watchers below are used to sync the resolved state of comments with the document.
   *  This is especially useful for undo/redo operations that are not handled by the editor.
   */
  watch(editorCommentPositions, () => {
    syncResolvedCommentsWithDocument();
  });

  watch(
    commentsList,
    () => {
      syncResolvedCommentsWithDocument();
    },
    { deep: false },
  );

  /**
   * Normalize a position object to a consistent { start, end } format.
   * Handles different editor position schemas (start/end, pos/to, from/to).
   *
   * @param {Object | null | undefined} position The position object
   * @returns {{ start: number, end: number } | null} The normalized range or null
   */
  const getCommentPositionRange = (position) => {
    if (!position) return null;
    const start = position.start ?? position.pos ?? position.from;
    const end = position.end ?? position.to ?? start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { start, end };
  };

  /**
   * Get the editor position data for a comment.
   *
   * @param {Object | string} commentOrId The comment object or comment ID
   * @returns {Object | null} The position data from editorCommentPositions
   */
  const getCommentPosition = (commentOrId) => {
    return resolveCommentPositionEntry(commentOrId).entry ?? null;
  };

  /**
   * Get the text that a comment is anchored to in the document.
   *
   * @param {Object | string} commentOrId The comment object or comment ID
   * @param {Object} [options] Options for text extraction
   * @param {string} [options.separator=' '] Separator for textBetween when crossing nodes
   * @param {boolean} [options.trim=true] Whether to trim whitespace from the result
   * @returns {string | null} The anchored text or null if unavailable
   */
  const getCommentAnchoredText = (commentOrId, options = {}) => {
    const comment = typeof commentOrId === 'object' ? commentOrId : getComment(commentOrId);
    if (!comment) return null;

    const position = resolveCommentPositionEntry(commentOrId).entry ?? null;
    const range = getCommentPositionRange(position);
    if (!range) return null;

    const doc = superdocStore.getDocument(comment.fileId);
    const editor = doc?.getEditor?.();
    const docNode = editor?.state?.doc;
    if (!docNode?.textBetween) return null;

    const separator = options.separator ?? ' ';
    const text = docNode.textBetween(range.start, range.end, separator, separator);
    return options.trim === false ? text : text?.trim();
  };

  /**
   * Get both position and anchored text data for a comment.
   *
   * @param {Object | string} commentOrId The comment object or comment ID
   * @param {Object} [options] Options passed to getCommentAnchoredText
   * @param {string} [options.separator=' '] Separator for textBetween when crossing nodes
   * @param {boolean} [options.trim=true] Whether to trim whitespace from the result
   * @returns {{ position: Object, anchoredText: string | null } | null} The anchor data or null
   */
  const getCommentAnchorData = (commentOrId, options = {}) => {
    const position = getCommentPosition(commentOrId);
    if (!position) return null;
    return {
      position,
      anchoredText: getCommentAnchoredText(commentOrId, options),
    };
  };

  const isThreadVisible = (comment) => {
    if (!isViewingMode.value) return true;
    const parent = getThreadParent(comment);
    if (!parent && comment?.parentCommentId) return false;
    // Check both parent's trackedChange flag and comment's trackedChangeParentId
    const isTrackedChange = Boolean(parent?.trackedChange) || Boolean(comment?.trackedChangeParentId);
    return isTrackedChange ? viewingVisibility.trackChangesVisible : viewingVisibility.commentsVisible;
  };

  /**
   * Set the active comment or clear all active comments
   *
   * @param {Object | undefined | null} superdoc The SuperDoc instance holding the active editor
   * @param {string | undefined | null} id The comment ID
   * @returns {void}
   */
  const setActiveComment = (superdoc, id) => {
    const activeEditor = superdoc?.activeEditor;

    // If no ID, we clear any focused comments
    if (id === undefined || id === null) {
      activeComment.value = null;
      activeEditor?.commands?.setActiveComment({ commentId: null });
      return;
    }

    const comment = getComment(id);
    if (comment) activeComment.value = comment.commentId;
    activeEditor?.commands?.setActiveComment({ commentId: activeComment.value });
  };

  /**
   * Called when a tracked change is updated. Creates a new comment if necessary,
   * or updates an existing tracked-change comment.
   *
   * @param {Object} param0
   * @param {Object} param0.superdoc The SuperDoc instance
   * @param {Object} param0.params The tracked change params
   * @returns {void}
   */
  const handleTrackedChangeUpdate = ({ superdoc, params }) => {
    const {
      event,
      changeId,
      trackedChangeText,
      trackedChangeType,
      trackedChangeDisplayType,
      deletedText,
      authorEmail,
      authorImage,
      date,
      author: authorName,
      importedAuthor,
      documentId,
      coords,
    } = params;
    const normalizedDocumentId = documentId != null ? String(documentId) : null;

    const comment = getPendingComment({
      documentId,
      commentId: changeId,
      trackedChange: true,
      trackedChangeText,
      trackedChangeType,
      trackedChangeDisplayType,
      deletedText,
      createdTime: date,
      creatorName: authorName,
      creatorEmail: authorEmail,
      creatorImage: authorImage,
      isInternal: false,
      importedAuthor,
      selection: {
        source: 'super-editor',
        selectionBounds: coords,
      },
    });

    const findTrackedChangeById = () => {
      const normalizedChangeId = changeId != null ? String(changeId) : null;
      if (!normalizedChangeId) return null;

      const matchesId = (trackedComment) => {
        if (!trackedComment) return false;
        const commentId = trackedComment.commentId != null ? String(trackedComment.commentId) : null;
        const importedId = trackedComment.importedId != null ? String(trackedComment.importedId) : null;
        return commentId === normalizedChangeId || importedId === normalizedChangeId;
      };

      if (normalizedDocumentId) {
        return commentsList.value.find(
          (trackedComment) => matchesId(trackedComment) && belongsToDocument(trackedComment, normalizedDocumentId),
        );
      }

      return commentsList.value.find(matchesId);
    };

    if (event === 'add') {
      const existing = findTrackedChangeById();
      if (existing) {
        // Undo/redo after accept/reject can rematerialize a previously resolved
        // tracked change. Reopen the thread so the bubble is actionable again.
        if (existing.resolvedTime) clearResolvedMetadata(existing);

        // Already exists (e.g. created during batch import) — update instead of duplicating
        // Partial resolution can turn a replacement into insert-only/delete-only, so
        // clear fields explicitly when the updated payload no longer includes them.
        existing.trackedChangeText = trackedChangeText ?? null;
        existing.trackedChangeType = trackedChangeType ?? null;
        existing.trackedChangeDisplayType = trackedChangeDisplayType ?? null;
        existing.deletedText = deletedText ?? null;

        const emitData = {
          type: COMMENT_EVENTS.UPDATE,
          comment: existing.getValues(),
        };

        syncCommentsToClients(superdoc, emitData);
        debounceEmit(changeId, emitData, superdoc);
        return;
      }
      addComment({ superdoc, comment });
    } else if (event === 'update') {
      // If we have an update event, simply update the composable comment
      const existingTrackedChange = findTrackedChangeById();
      if (!existingTrackedChange) return;
      if (existingTrackedChange.resolvedTime) clearResolvedMetadata(existingTrackedChange);

      // Partial resolution can turn a replacement into insert-only/delete-only, so
      // clear fields explicitly when the updated payload no longer includes them.
      existingTrackedChange.trackedChangeText = trackedChangeText ?? null;
      existingTrackedChange.trackedChangeType = trackedChangeType ?? null;
      existingTrackedChange.trackedChangeDisplayType = trackedChangeDisplayType ?? null;
      existingTrackedChange.deletedText = deletedText ?? null;

      const emitData = {
        type: COMMENT_EVENTS.UPDATE,
        comment: existingTrackedChange.getValues(),
      };

      syncCommentsToClients(superdoc, emitData);
      debounceEmit(changeId, emitData, superdoc);
    } else if (event === 'resolve') {
      const existingTrackedChange = findTrackedChangeById();
      if (!existingTrackedChange || existingTrackedChange.resolvedTime) return;

      // Selection/toolbar reject emits tracked-change resolve events. Use the same
      // resolution path as the comment dialog so one method owns state + sync + emit.
      existingTrackedChange.resolveComment({
        email: params.resolvedByEmail ?? superdoc?.user?.email ?? null,
        name: params.resolvedByName ?? superdoc?.user?.name ?? null,
        superdoc,
      });
    }
  };

  const requestInstantSidebarAlignment = (targetY = null) => {
    instantSidebarAlignmentTargetY.value = Number.isFinite(targetY) ? targetY : null;
  };

  const peekInstantSidebarAlignment = () => {
    const targetY = instantSidebarAlignmentTargetY.value;
    return Number.isFinite(targetY) ? targetY : null;
  };

  const clearInstantSidebarAlignment = () => {
    instantSidebarAlignmentTargetY.value = null;
  };

  const debounceEmit = (commentId, event, superdoc, delay = 1000) => {
    if (debounceTimers[commentId]) {
      clearTimeout(debounceTimers[commentId]);
    }

    debounceTimers[commentId] = setTimeout(() => {
      if (superdoc) {
        superdoc.emit('comments-update', event);
      }
      delete debounceTimers[commentId];
    }, delay);
  };

  const showAddComment = (superdoc, targetClientY = null) => {
    const event = { type: COMMENT_EVENTS.PENDING };
    superdoc.emit('comments-update', event);

    const selection = { ...superdocStore.activeSelection };
    selection.selectionBounds = { ...selection.selectionBounds };

    if (superdocStore.selectionPosition?.source && superdocStore.selectionPosition.source !== 'pdf') {
      superdocStore.selectionPosition.source = null;
    }

    pendingComment.value = getPendingComment({ selection, documentId: selection.documentId, parentCommentId: null });
    if (!superdoc.config.isInternal) pendingComment.value.isInternal = false;

    if (superdoc.activeEditor?.commands) {
      superdoc.activeEditor.commands.insertComment({
        ...pendingComment.value.getValues(),
        commentId: 'pending',
        skipEmit: true,
      });
    }

    if (pendingComment.value.selection.source === 'super-editor' && superdocStore.selectionPosition) {
      superdocStore.selectionPosition.source = 'super-editor';
    }

    requestInstantSidebarAlignment(targetClientY);
    activeComment.value = pendingComment.value.commentId;
  };

  /**
   * Get the numeric position value for sorting a comment by document order.
   * Checks multiple position properties to handle different editor position schemas
   * (e.g., ProseMirror uses from/to, other editors may use start/pos).
   *
   * @param {Object} comment - The comment object
   * @returns {number|null} The position value, or null if not found
   */
  const getPositionSortValue = (comment) => {
    const position = resolveCommentPositionEntry(comment).entry;
    if (!position) return null;
    // Check different position properties to handle various editor position schemas
    if (Number.isFinite(position.start)) return position.start;
    if (Number.isFinite(position.pos)) return position.pos;
    if (Number.isFinite(position.from)) return position.from;
    if (Number.isFinite(position.to)) return position.to;
    return null;
  };

  /**
   * Comparator that sorts comments by creation time (ascending).
   *
   * @param {Object} a - First comment
   * @param {Object} b - Second comment
   * @returns {number} Comparison result
   */
  const compareByCreatedTime = (a, b) => (a.createdTime ?? 0) - (b.createdTime ?? 0);

  /**
   * Comparator that sorts comments by document position (ascending).
   * Comments without positions are sorted after those with positions.
   * Falls back to creation time when positions are equal or unavailable.
   *
   * @param {Object} a - First comment
   * @param {Object} b - Second comment
   * @returns {number} Comparison result
   */
  const compareByPosition = (a, b) => {
    const posA = getPositionSortValue(a);
    const posB = getPositionSortValue(b);

    const hasA = Number.isFinite(posA);
    const hasB = Number.isFinite(posB);

    if (hasA && hasB && posA !== posB) return posA - posB;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    return compareByCreatedTime(a, b);
  };

  /**
   * Generate the comments list separating resolved and active.
   * We only return parent comments here, since CommentDialog.vue will handle threaded comments.
   *
   * @param {(a: Object, b: Object) => number} sorter - Comparator function for sorting comments
   * @returns {{parentComments: Array, resolvedComments: Array}} Grouped and sorted comments
   */
  const buildGroupedComments = (sorter) => {
    const parentComments = [];
    const resolvedComments = [];
    const childCommentMap = new Map();

    commentsList.value.forEach((comment) => {
      if (!isThreadVisible(comment)) return;
      const trackedChangeParentId = shouldThreadWithTrackedChange(comment) ? comment.trackedChangeParentId : null;
      const parentId = comment.parentCommentId || trackedChangeParentId;
      // Track resolved comments
      if (comment.resolvedTime) {
        resolvedComments.push(comment);
      }

      // Track parent comments
      else if (!parentId && !comment.resolvedTime) {
        parentComments.push({ ...comment });
      }

      // Track child comments (threaded comments)
      else if (parentId) {
        if (!childCommentMap.has(parentId)) {
          childCommentMap.set(parentId, []);
        }
        childCommentMap.get(parentId).push(comment);
      }
    });

    // Return only parent comments
    const sortedParentComments = parentComments.sort(sorter);
    const sortedResolvedComments = resolvedComments.sort(sorter);

    return {
      parentComments: sortedParentComments,
      resolvedComments: sortedResolvedComments,
    };
  };

  /** @type {import('vue').ComputedRef<{parentComments: Array, resolvedComments: Array}>} Comments grouped and sorted by creation time */
  const getGroupedComments = computed(() => buildGroupedComments(compareByCreatedTime));

  /** @type {import('vue').ComputedRef<{parentComments: Array, resolvedComments: Array}>} Comments grouped and sorted by document position */
  const getCommentsByPosition = computed(() => buildGroupedComments(compareByPosition));

  const hasOverlapId = (id) => overlappedIds.includes(id);
  const documentsWithConverations = computed(() => {
    return superdocStore.documents;
  });

  const getConfig = computed(() => {
    return commentsConfig;
  });

  const getCommentLocation = (selection, parent) => {
    const containerBounds = selection.getContainerLocation(parent);
    const top = containerBounds.top + selection.selectionBounds.top;
    const left = containerBounds.left + selection.selectionBounds.left;
    return {
      top: top,
      left: left,
    };
  };

  /**
   * Get a new pending comment
   *
   * @param {Object} param0
   * @param {Object} param0.selection The selection object
   * @param {String} param0.documentId The document ID
   * @param {String} param0.parentCommentId The parent comment
   * @returns {Object} The new comment object
   */
  const getPendingComment = ({ selection, documentId, parentCommentId, ...options }) => {
    return _getNewcomment({ selection, documentId, parentCommentId, ...options });
  };

  /**
   * Get the new comment object
   *
   * @param {Object} param0
   * @param {Object} param0.selection The selection object
   * @param {String} param0.documentId The document ID
   * @param {String} param0.parentCommentId The parent comment ID
   * @returns {Object} The new comment object
   */
  const _getNewcomment = ({ selection, documentId, parentCommentId, ...options }) => {
    let activeDocument;
    if (documentId) activeDocument = superdocStore.getDocument(documentId);
    else if (selection) activeDocument = superdocStore.getDocument(selection.documentId);

    if (!activeDocument) activeDocument = superdocStore.documents[0];

    return useComment({
      fileId: activeDocument.id,
      fileType: activeDocument.type,
      parentCommentId,
      creatorEmail: superdocStore.user.email,
      creatorName: superdocStore.user.name,
      creatorImage: superdocStore.user.image,
      commentText: currentCommentText.value,
      selection,
      ...options,
    });
  };

  /**
   * Remove the pending comment
   *
   * @returns {void}
   */
  const removePendingComment = (superdoc) => {
    const hadPending = !!pendingComment.value;
    currentCommentText.value = '';
    pendingComment.value = null;
    superdocStore.selectionPosition = null;

    // Only clear active comment when removing an actual pending comment.
    // Replies and edits also call this to reset currentCommentText, but
    // clearing activeComment would deactivate the thread (SD-2035).
    if (hadPending) {
      activeComment.value = null;
    }

    superdoc?.activeEditor?.commands?.removeComment({ commentId: 'pending' });
  };

  /**
   * Add a new comment to the document
   *
   * @param {Object} param0
   * @param {Object} param0.superdoc The SuperDoc instance
   * @returns {void}
   */
  const addComment = ({ superdoc, comment, skipEditorUpdate = false }) => {
    let parentComment = commentsList.value.find((c) => c.commentId === activeComment.value);
    if (!parentComment) parentComment = comment;

    const newComment = useComment(comment.getValues());

    if (pendingComment.value) newComment.setText({ text: currentCommentText.value, suppressUpdate: true });
    else newComment.setText({ text: comment.commentText, suppressUpdate: true });
    newComment.selection.source = pendingComment.value?.selection?.source ?? newComment.selection.source;

    // Set isInternal flag
    if (parentComment) {
      const isParentInternal = parentComment.isInternal;
      newComment.isInternal = isParentInternal;
    }

    // If the current user is not internal, set the comment to external
    if (!superdoc.config.isInternal) newComment.isInternal = false;

    // Add the new comments to our global list
    commentsList.value.push(newComment);

    // Clean up the pending comment
    removePendingComment(superdoc);

    // If this is not a tracked change, and it belongs to a Super Editor, and its not a child comment
    // We need to let the editor know about the new comment
    if (!skipEditorUpdate && !comment.trackedChange && superdoc.activeEditor?.commands && !comment.parentCommentId) {
      // Add the comment to the active editor
      superdoc.activeEditor.commands.insertComment({ ...newComment.getValues(), skipEmit: true });
    }

    const event = { type: COMMENT_EVENTS.ADD, comment: newComment.getValues() };

    // If collaboration is enabled, sync the comments to all clients
    syncCommentsToClients(superdoc, event);

    // Emit event for end users
    superdoc.emit('comments-update', event);
  };

  const deleteComment = ({ commentId: commentIdToDelete, superdoc }) => {
    const commentIndex = commentsList.value.findIndex((c) => c.commentId === commentIdToDelete);
    const comment = commentsList.value[commentIndex];
    if (!comment) {
      return;
    }
    const { commentId, importedId } = comment;
    const { fileId } = comment;

    superdoc.activeEditor?.commands?.removeComment({ commentId, importedId });

    // Remove the current comment
    commentsList.value.splice(commentIndex, 1);

    // Remove any child comments of the removed comment
    const childCommentIds = commentsList.value
      .filter((c) => c.parentCommentId === commentId)
      .map((c) => c.commentId || c.importedId);
    commentsList.value = commentsList.value.filter((c) => !childCommentIds.includes(c.commentId));

    // Clear active state so floating layout doesn't reference a deleted comment
    if (activeComment.value === commentId || childCommentIds.includes(activeComment.value)) {
      activeComment.value = null;
    }

    const event = {
      type: COMMENT_EVENTS.DELETED,
      comment: comment.getValues(),
      changes: [{ key: 'deleted', commentId, fileId }],
    };

    superdoc.emit('comments-update', event);
    syncCommentsToClients(superdoc, event);
  };

  /**
   * Cancel the pending comment
   *
   * @returns {void}
   */
  const cancelComment = (superdoc) => {
    removePendingComment(superdoc);
  };

  /**
   * Initialize loaded comments into SuperDoc by mapping the imported
   * comment data to SuperDoc useComment objects.
   *
   * Updates the commentsList ref with the new comments.
   *
   * @param {Object} param0
   * @param {Array} param0.comments The comments to be loaded
   * @param {String} param0.documentId The document ID
   * @returns {void}
   */
  const processLoadedDocxComments = async ({ superdoc, editor, comments, documentId }) => {
    const document = superdocStore.getDocument(documentId);
    if (document?.commentThreadingProfile) {
      document.commentThreadingProfile.value = editor?.converter?.commentThreadingProfile || null;
    }

    comments.forEach((comment) => {
      const textElements = Array.isArray(comment.elements) ? comment.elements : [];
      const htmlContent = getHtmlFromComment(textElements);

      if (!htmlContent && !comment.trackedChange) {
        return;
      }

      const creatorName = comment.creatorName.replace('(imported)', '');
      const importedName = `${creatorName} (imported)`;
      const newComment = useComment({
        fileId: documentId,
        fileType: document.type,
        docxCommentJSON: textElements.length ? textElements : null,
        commentId: comment.commentId,
        isInternal: false,
        parentCommentId: comment.parentCommentId,
        trackedChangeParentId: comment.trackedChangeParentId,
        creatorName,
        createdTime: comment.createdTime,
        creatorEmail: comment.creatorEmail,
        importedAuthor: {
          name: importedName,
          email: comment.creatorEmail,
        },
        commentText: htmlContent,
        resolvedTime: comment.isDone ? Date.now() : null,
        resolvedByEmail: comment.isDone ? comment.creatorEmail : null,
        resolvedByName: comment.isDone ? importedName : null,
        trackedChange: comment.trackedChange || false,
        trackedChangeText: comment.trackedChangeText,
        trackedChangeType: comment.trackedChangeType,
        trackedChangeDisplayType: comment.trackedChangeDisplayType,
        deletedText: comment.trackedDeletedText,
        // Preserve origin metadata for export
        origin: comment.origin || 'word', // Default to 'word' for backward compatibility
        threadingMethod: comment.threadingMethod,
        threadingStyleOverride: comment.threadingStyleOverride,
        threadingParentCommentId: comment.threadingParentCommentId,
        originalXmlStructure: comment.originalXmlStructure,
      });

      addComment({ superdoc, comment: newComment });
    });

    setTimeout(() => {
      // do not block the first rendering of the doc
      // and create comments asynchronously.
      createCommentForTrackChanges(editor, superdoc);
    }, 0);
  };

  const createCommentForTrackChanges = (editor, superdoc, trackedChangesOverride = null, options = {}) => {
    const { reopenResolved = false } = options;
    const trackedChanges = trackedChangesOverride ?? trackChangesHelpers.getTrackChanges(editor.state);
    const groupedChanges = groupChanges(trackedChanges);
    const activeDocumentId = editor?.options?.documentId != null ? String(editor.options.documentId) : null;
    if (!activeDocumentId) return;

    // Build a Set of existing unresolved tracked-change IDs for O(1) lookup.
    // Include both runtime and imported IDs to avoid duplicate threads when
    // replay/import flows remap commentId but marks still reference importedId.
    // History replay can opt in to excluding resolved tracked-change threads so
    // undo/redo reopens them when their marks reappear. Initial import rebuilds
    // keep resolved IDs in the set so resolved DOCX threads do not reopen on load.
    const skipIds = new Set();
    commentsList.value.forEach((comment) => {
      if (!comment?.trackedChange) return;
      if (!belongsToDocument(comment, activeDocumentId)) return;
      if (comment.resolvedTime && !reopenResolved) {
        if (comment.commentId != null) skipIds.add(String(comment.commentId));
        if (comment.importedId != null) skipIds.add(String(comment.importedId));
        return;
      }
      if (comment.resolvedTime) return;
      if (comment.commentId != null) skipIds.add(String(comment.commentId));
      if (comment.importedId != null) skipIds.add(String(comment.importedId));
    });

    // Build a Map of change ID → tracked change entries for O(1) lookup per group.
    // This avoids re-scanning the entire document for each tracked change.
    const changesByIdMap = new Map();
    for (const change of trackedChanges) {
      const id = change.mark.attrs.id;
      if (!changesByIdMap.has(id)) changesByIdMap.set(id, []);
      changesByIdMap.get(id).push(change);
    }

    const documentId = activeDocumentId;

    // Build comment params directly from grouped changes — no PM dispatch needed
    groupedChanges.forEach(({ insertedMark, deletionMark, formatMark }) => {
      const id = insertedMark?.mark.attrs.id || deletionMark?.mark.attrs.id || formatMark?.mark.attrs.id;
      if (!id || skipIds.has(id)) return;

      const marks = {
        ...(insertedMark && { insertedMark: insertedMark.mark }),
        ...(deletionMark && { deletionMark: deletionMark.mark }),
        ...(formatMark && { formatMark: formatMark.mark }),
      };

      // nodes/deletionNodes are unused here — the function resolves them from
      // trackedChangesForId which already contains all document positions for this ID.
      const params = createOrUpdateTrackedChangeComment({
        event: 'add',
        marks,
        nodes: [],
        newEditorState: editor.state,
        documentId,
        trackedChangesForId: changesByIdMap.get(id) || [],
      });

      if (params) {
        handleTrackedChangeUpdate({ superdoc, params });
        skipIds.add(String(id));
        if (params.changeId != null) skipIds.add(String(params.changeId));
        if (params.importedId != null) skipIds.add(String(params.importedId));
      }
    });

    // Single force-update to refresh decorations
    const { tr } = editor.view.state;
    tr.setMeta(CommentsPluginKey, { type: 'force' });
    editor.view.dispatch(tr);
  };

  const getCommentDocumentId = (comment) => {
    if (!comment) return null;
    if (comment.fileId != null) return String(comment.fileId);
    if (comment.documentId != null) return String(comment.documentId);
    if (comment.selection?.documentId != null) return String(comment.selection.documentId);
    return null;
  };

  const belongsToDocument = (comment, activeDocumentId) => {
    if (!activeDocumentId) return false;

    const commentDocumentId = getCommentDocumentId(comment);
    if (commentDocumentId) {
      return commentDocumentId === activeDocumentId;
    }

    // Legacy fallback: in single-document sessions, comments may not carry explicit
    // document metadata yet. Treat them as belonging to the only open document.
    const docs = Array.isArray(superdocStore.documents) ? superdocStore.documents : superdocStore.documents?.value;
    if (Array.isArray(docs) && docs.length === 1) {
      const onlyDocumentId = docs[0]?.id != null ? String(docs[0].id) : null;
      return onlyDocumentId === activeDocumentId;
    }

    return false;
  };

  /**
   * Remove tracked-change comments that no longer have a corresponding mark in the editor.
   * Also removes any replies linked to those removed tracked-change threads.
   *
   * Pruning is scoped to the active editor document so replay in one document does not
   * delete tracked-change comments from other open documents.
   *
   * @param {Set<string>} liveTrackedChangeIds IDs currently present in editor marks.
   * @param {string | null} activeDocumentId Document currently being synced.
   * @returns {void}
   */
  const pruneStaleTrackedChangeComments = (liveTrackedChangeIds, activeDocumentId, superdoc = null) => {
    if (!(liveTrackedChangeIds instanceof Set) || !activeDocumentId) return;

    const removedIds = new Set();
    const restoredComments = [];
    const previousComments = [...commentsList.value];

    commentsList.value = commentsList.value.filter((comment) => {
      if (!comment?.trackedChange) return true;
      if (!belongsToDocument(comment, activeDocumentId)) return true;

      const commentId = comment.commentId != null ? String(comment.commentId) : null;
      const importedId = comment.importedId != null ? String(comment.importedId) : null;
      const hasLiveCommentId = Boolean(commentId && liveTrackedChangeIds.has(commentId));
      const hasLiveImportedId = Boolean(importedId && liveTrackedChangeIds.has(importedId));

      if ((!commentId && !importedId) || hasLiveCommentId || hasLiveImportedId) return true;
      if (comment.resolvedTime) return true;

      const resolutionSnapshot = trackedChangeResolutionSnapshots.get(comment);
      if (resolutionSnapshot) {
        comment.resolvedTime = resolutionSnapshot.resolvedTime ?? Date.now();
        comment.resolvedByEmail = resolutionSnapshot.resolvedByEmail ?? null;
        comment.resolvedByName = resolutionSnapshot.resolvedByName ?? null;
        restoredComments.push(comment);
        return true;
      }

      if (commentId) removedIds.add(commentId);
      if (importedId) removedIds.add(importedId);
      return false;
    });

    restoredComments.forEach((comment) => {
      const payload = getCommentEventPayload(comment);
      const event = {
        type: COMMENT_EVENTS.UPDATE,
        comment: payload,
      };
      syncCommentsToClients(superdoc, event);
      superdoc?.emit?.('comments-update', event);
    });

    if (!removedIds.size) return;

    let didRemoveDescendants = true;
    while (didRemoveDescendants) {
      didRemoveDescendants = false;
      commentsList.value = commentsList.value.filter((comment) => {
        if (!belongsToDocument(comment, activeDocumentId)) return true;

        const parentCommentId = comment.parentCommentId != null ? String(comment.parentCommentId) : null;
        const trackedChangeParentId =
          comment.trackedChangeParentId != null ? String(comment.trackedChangeParentId) : null;
        const isLinkedToRemovedParent =
          (parentCommentId && removedIds.has(parentCommentId)) ||
          (trackedChangeParentId && removedIds.has(trackedChangeParentId));

        if (!isLinkedToRemovedParent) return true;

        const commentId = comment.commentId != null ? String(comment.commentId) : null;
        const importedId = comment.importedId != null ? String(comment.importedId) : null;
        if (commentId) removedIds.add(commentId);
        if (importedId) removedIds.add(importedId);
        didRemoveDescendants = true;
        return false;
      });
    }

    const removedComments = previousComments.filter((comment) => {
      if (!belongsToDocument(comment, activeDocumentId)) return false;
      const commentId = comment.commentId != null ? String(comment.commentId) : null;
      const importedId = comment.importedId != null ? String(comment.importedId) : null;
      return (commentId && removedIds.has(commentId)) || (importedId && removedIds.has(importedId));
    });

    removedComments.forEach((comment) => {
      const payload = getCommentEventPayload(comment);
      const event = {
        type: COMMENT_EVENTS.DELETED,
        comment: payload,
        changes: [{ key: 'deleted', commentId: payload.commentId, fileId: payload.fileId }],
      };
      syncCommentsToClients(superdoc, event);
      superdoc?.emit?.('comments-update', event);
    });

    const activeCommentId = activeComment.value != null ? String(activeComment.value) : null;
    const activeCommentBelongsToActiveDocument = previousComments.some((comment) => {
      const commentId = comment.commentId != null ? String(comment.commentId) : null;
      const importedId = comment.importedId != null ? String(comment.importedId) : null;
      return (
        belongsToDocument(comment, activeDocumentId) &&
        ((commentId && commentId === activeCommentId) || (importedId && importedId === activeCommentId))
      );
    });
    if (activeCommentId && removedIds.has(activeCommentId) && activeCommentBelongsToActiveDocument) {
      activeComment.value = null;
    }
  };

  /**
   * Rebuild tracked-change comments from the current editor state.
   *
   * Useful after bulk document transforms (like diff replay) where tracked-change
   * marks may be remapped and incremental tracked-change events are not emitted.
   *
   * @param {Object} param0
   * @param {Object} param0.superdoc The SuperDoc instance.
   * @param {Object} param0.editor The active Super Editor instance.
   * @returns {void}
   */
  const syncTrackedChangeComments = ({ superdoc, editor }) => {
    if (!superdoc || !editor) return;
    const activeDocumentId = editor?.options?.documentId != null ? String(editor.options.documentId) : null;
    if (!activeDocumentId) return;

    const trackedChanges = trackChangesHelpers.getTrackChanges(editor.state);
    const liveTrackedChangeIds = new Set();
    trackedChanges.forEach((change) => {
      const id = change?.mark?.attrs?.id;
      if (id == null) return;
      liveTrackedChangeIds.add(String(id));
    });

    pruneStaleTrackedChangeComments(liveTrackedChangeIds, activeDocumentId, superdoc);
    createCommentForTrackChanges(editor, superdoc, trackedChanges, { reopenResolved: true });
  };

  const normalizeDocxSchemaForExport = (value) => {
    if (!value) return [];
    const nodes = Array.isArray(value) ? value : [value];
    return nodes.filter(Boolean);
  };

  const translateCommentsForExport = () => {
    const processedComments = [];
    commentsList.value.forEach((comment) => {
      const values = comment.getValues();
      const richText = values.commentText;
      // If this comment originated from DOCX (Word or Google Docs), prefer the
      // original DOCX-schema JSON captured at import time. Otherwise, fall back
      // to rebuilding commentJSON from the rich-text HTML.
      const docxSchema = normalizeDocxSchemaForExport(values.docxCommentJSON);
      const schema = docxSchema.length ? docxSchema : convertHtmlToSchema(richText);
      processedComments.push({
        ...values,
        commentJSON: schema,
      });
    });
    return processedComments;
  };

  const convertHtmlToSchema = (commentHTML) => {
    const editor = new Editor({
      mode: 'text',
      isHeadless: true,
      content: commentHTML,
      extensions: getRichTextExtensions(),
    });
    const json = editor.getJSON();
    return Array.isArray(json?.content) ? json.content.filter(Boolean) : [];
  };

  /**
   * Triggered when the editor locations are updated
   * Updates floating comment locations from the editor
   *
   * @param {DOMElement} parentElement The parent element of the editor
   * @returns {void}
   */
  const handleEditorLocationsUpdate = (allCommentPositions) => {
    if (allCommentPositions == null) {
      return;
    }
    // `{}` is authoritative: when marks are removed, positions can become empty
    // and we must clear stale anchors instead of preserving previous ones.
    editorCommentPositions.value = allCommentPositions;
  };

  /**
   * Clear editor comment positions (used when entering viewing mode to hide comment bubbles)
   */
  const clearEditorCommentPositions = () => {
    editorCommentPositions.value = {};
  };

  const getFloatingComments = computed(() => {
    const comments = getGroupedComments.value?.parentComments
      .filter((c) => !c.resolvedTime)
      .filter((c) => {
        // Non-editor comments (e.g. PDF) are always shown.
        // Editor-backed comments (including tracked changes, which have no
        // selection.source) must have a live position in the document.
        if (!isEditorBackedComment(c)) return true;
        return Boolean(resolveCommentPositionEntry(c).entry);
      });
    return comments;
  });

  const setViewingVisibility = ({ documentMode, commentsVisible, trackChangesVisible } = {}) => {
    if (typeof documentMode === 'string') {
      viewingVisibility.documentMode = documentMode;
    }
    if (typeof commentsVisible === 'boolean') {
      viewingVisibility.commentsVisible = commentsVisible;
    }
    if (typeof trackChangesVisible === 'boolean') {
      viewingVisibility.trackChangesVisible = trackChangesVisible;
    }
  };

  /**
   * Get HTML content from the comment text JSON (which uses DOCX schema)
   *
   * @param {Object} commentTextJson The comment text JSON
   * @returns {string} The HTML content
   */
  const normalizeCommentForEditor = (node) => {
    if (Array.isArray(node)) {
      return node
        .map((child) => normalizeCommentForEditor(child))
        .flat()
        .filter(Boolean);
    }

    if (!node || typeof node !== 'object') return node;

    const stripTextStyleAttrs = (attrs) => {
      if (!attrs) return attrs;
      const rest = { ...attrs };
      delete rest.fontSize;
      delete rest.fontFamily;
      delete rest.eastAsiaFontFamily;
      return Object.keys(rest).length ? rest : undefined;
    };

    const normalizeMark = (mark) => {
      if (!mark) return mark;
      const typeName = typeof mark.type === 'string' ? mark.type : mark.type?.name;
      const attrs = mark?.attrs ? { ...mark.attrs } : undefined;
      if (typeName === 'textStyle' && attrs) {
        return { ...mark, attrs: stripTextStyleAttrs(attrs) };
      }
      return { ...mark, attrs };
    };

    const cloneMarks = (marks) =>
      Array.isArray(marks) ? marks.filter(Boolean).map((mark) => normalizeMark(mark)) : undefined;

    const cloneAttrs = (attrs) => (attrs && typeof attrs === 'object' ? { ...attrs } : undefined);

    if (!Array.isArray(node.content)) {
      return {
        type: node.type,
        ...(node.text !== undefined ? { text: node.text } : {}),
        ...(node.attrs ? { attrs: cloneAttrs(node.attrs) } : {}),
        ...(node.marks ? { marks: cloneMarks(node.marks) } : {}),
      };
    }

    const normalizedChildren = node.content
      .map((child) => normalizeCommentForEditor(child))
      .flat()
      .filter(Boolean);

    if (node.type === 'run') {
      return normalizedChildren;
    }

    return {
      type: node.type,
      ...(node.attrs ? { attrs: cloneAttrs(node.attrs) } : {}),
      ...(node.marks ? { marks: cloneMarks(node.marks) } : {}),
      content: normalizedChildren,
    };
  };

  const getHtmlFromComment = (commentTextElements) => {
    // If no content, we can't convert and its not a valid comment
    const elementsArray = Array.isArray(commentTextElements)
      ? commentTextElements
      : commentTextElements
        ? [commentTextElements]
        : [];
    const hasContent = elementsArray.some((element) => element?.content?.length);
    if (!hasContent) return;

    try {
      const normalizedContent = normalizeCommentForEditor(elementsArray);
      const contentArray = Array.isArray(normalizedContent)
        ? normalizedContent
        : normalizedContent
          ? [normalizedContent]
          : [];
      if (!contentArray.length) return null;
      const editor = new Editor({
        mode: 'text',
        isHeadless: true,
        content: {
          type: 'doc',
          content: contentArray,
        },
        loadFromSchema: true,
        extensions: getRichTextExtensions(),
      });
      return editor.getHTML();
    } catch (error) {
      console.warn('Failed to convert comment', error);
      return;
    }
  };

  return {
    COMMENT_EVENTS,
    isDebugging,
    hasInitializedComments,
    hasSyncedCollaborationComments,
    editingCommentId,
    activeComment,
    commentDialogs,
    overlappingComments,
    overlappedIds,
    suppressInternalExternal,
    pendingComment,
    currentCommentText,
    commentsList,
    isCommentsListVisible,
    generalCommentIds,
    editorCommentIds,
    commentsParentElement,
    editorCommentPositions,
    hasInitializedLocations,
    isCommentHighlighted,

    // Floating comments
    floatingCommentsOffset,
    sortedConversations,
    visibleConversations,
    skipSelectionUpdate,
    isFloatingCommentsReady,
    // Getters
    getConfig,
    documentsWithConverations,
    getGroupedComments,
    getCommentsByPosition,
    getFloatingComments,
    getCommentAliasIds,
    getCommentPositionKey,
    getCommentPosition,
    getCommentAnchoredText,
    getCommentAnchorData,
    resolveCommentPositionEntry,
    getCommentDocumentId,
    belongsToDocument,

    // Actions
    init,
    setViewingVisibility,
    getComment,
    setActiveComment,
    getCommentLocation,
    hasOverlapId,
    getPendingComment,
    showAddComment,
    addComment,
    cancelComment,
    deleteComment,
    removePendingComment,
    processLoadedDocxComments,
    translateCommentsForExport,
    handleEditorLocationsUpdate,
    clearEditorCommentPositions,
    handleTrackedChangeUpdate,
    syncTrackedChangePositionsWithDocument,
    requestInstantSidebarAlignment,
    peekInstantSidebarAlignment,
    clearInstantSidebarAlignment,
    syncTrackedChangeComments,
  };
});
