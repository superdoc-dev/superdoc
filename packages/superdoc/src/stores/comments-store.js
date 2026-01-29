import { defineStore } from 'pinia';
import { ref, reactive, computed, watch } from 'vue';
import { comments_module_events } from '@superdoc/common';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import { syncCommentsToClients } from '../core/collaboration/helpers.js';
import {
  Editor,
  trackChangesHelpers,
  TrackChangesBasePluginKey,
  CommentsPluginKey,
  getRichTextExtensions,
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
   * Prefers importedId for imported comments since editor marks retain the original ID.
   *
   * @param {Object | string | null | undefined} commentOrId The comment object or comment ID
   * @returns {string | null} The position key (importedId or commentId)
   */
  const getCommentPositionKey = (commentOrId) => {
    if (!commentOrId) return null;
    if (typeof commentOrId === 'object') {
      return commentOrId.importedId ?? commentOrId.commentId ?? null;
    }
    return commentOrId;
  };

  const clearResolvedMetadata = (comment) => {
    if (!comment) return;
    // Sets the resolved state to null so it can be restored in the comments sidebar
    comment.resolvedTime = null;
    comment.resolvedByEmail = null;
    comment.resolvedByName = null;
  };

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

  /**
   * Check if a comment is part of a tracked-change thread.
   * Returns true for tracked-change comments or replies to tracked changes.
   *
   * @param {Object} comment - The comment to check
   * @returns {boolean} True if the comment is a tracked-change thread
   */
  const isTrackedChangeThread = (comment) => Boolean(comment?.trackedChange) || Boolean(comment?.trackedChangeParentId);

  const syncResolvedCommentsWithDocument = () => {
    const docPositions = editorCommentPositions.value || {};
    const activeKeys = new Set(Object.keys(docPositions));
    if (!activeKeys.size) return;

    commentsList.value.forEach((comment) => {
      const key = getCommentPositionKey(comment);
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
    const key = getCommentPositionKey(commentOrId);
    if (!key) return null;
    return editorCommentPositions.value?.[key] ?? null;
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
    const key = getCommentPositionKey(commentOrId);
    if (!key) return null;

    const comment = typeof commentOrId === 'object' ? commentOrId : getComment(commentOrId);
    if (!comment) return null;

    const position = editorCommentPositions.value?.[key] ?? null;
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
   * @param {string | undefined | null} id The comment ID
   * @returns {void}
   */
  const setActiveComment = (superdoc, id) => {
    // If no ID, we clear any focused comments
    if (id === undefined || id === null) {
      activeComment.value = null;
      if (superdoc.activeEditor) {
        superdoc.activeEditor.commands?.setActiveComment({ commentId: null });
      }
      return;
    }

    const comment = getComment(id);
    if (comment) activeComment.value = comment.commentId;
    if (superdoc.activeEditor) {
      superdoc.activeEditor.commands?.setActiveComment({ commentId: activeComment.value });
    }
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
      deletedText,
      authorEmail,
      authorImage,
      date,
      author: authorName,
      importedAuthor,
      documentId,
      coords,
    } = params;

    const comment = getPendingComment({
      documentId,
      commentId: changeId,
      trackedChange: true,
      trackedChangeText,
      trackedChangeType,
      deletedText,
      createdTime: date,
      creatorName: authorName,
      creatorEmail: authorEmail,
      creatorImage: authorImage,
      isInternal: false,
      importedAuthor,
      selection: {
        selectionBounds: coords,
      },
    });

    if (event === 'add') {
      // If this is a new tracked change, add it to our comments
      addComment({ superdoc, comment });
    } else if (event === 'update') {
      // If we have an update event, simply update the composable comment
      const existingTrackedChange = commentsList.value.find((comment) => comment.commentId === changeId);
      if (!existingTrackedChange) return;

      existingTrackedChange.trackedChangeText = trackedChangeText;

      if (deletedText) {
        existingTrackedChange.deletedText = deletedText;
      }

      const emitData = {
        type: COMMENT_EVENTS.UPDATE,
        comment: existingTrackedChange.getValues(),
      };

      syncCommentsToClients(superdoc, emitData);
      debounceEmit(changeId, emitData, superdoc);
    }
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

  const showAddComment = (superdoc) => {
    const event = { type: COMMENT_EVENTS.PENDING };
    superdoc.emit('comments-update', event);

    const selection = { ...superdocStore.activeSelection };
    selection.selectionBounds = { ...selection.selectionBounds };

    if (superdocStore.selectionPosition?.source) {
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

    activeComment.value = pendingComment.value.commentID;
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
    const key = getCommentPositionKey(comment);
    if (!key) return null;
    const position = editorCommentPositions.value?.[key];
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
    currentCommentText.value = '';
    pendingComment.value = null;
    activeComment.value = null;
    superdocStore.selectionPosition = null;

    superdoc.activeEditor?.commands.removeComment({ commentId: 'pending' });
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
    newComment.selection.source = pendingComment.value?.selection?.source;

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
      const htmlContent = getHtmlFromComment(comment.textJson);

      if (!htmlContent && !comment.trackedChange) {
        return;
      }

      const creatorName = comment.creatorName.replace('(imported)', '');
      const importedName = `${creatorName} (imported)`;
      const newComment = useComment({
        fileId: documentId,
        fileType: document.type,
        docxCommentJSON: comment.textJson,
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
        commentText: getHtmlFromComment(comment.textJson),
        resolvedTime: comment.isDone ? Date.now() : null,
        resolvedByEmail: comment.isDone ? comment.creatorEmail : null,
        resolvedByName: comment.isDone ? importedName : null,
        trackedChange: comment.trackedChange || false,
        trackedChangeText: comment.trackedChangeText,
        trackedChangeType: comment.trackedChangeType,
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
      createCommentForTrackChanges(editor);
    }, 0);
  };

  const createCommentForTrackChanges = (editor) => {
    let trackedChanges = trackChangesHelpers.getTrackChanges(editor.state);

    const groupedChanges = groupChanges(trackedChanges);

    // Create comments for tracked changes
    // that do not have a corresponding comment (created in Word).
    const { tr } = editor.view.state;
    const { dispatch } = editor.view;

    groupedChanges.forEach(({ insertedMark, deletionMark, formatMark }, index) => {
      console.debug(`Create comment for track change: ${index}`);
      const foundComment = commentsList.value.find(
        (i) =>
          i.commentId === insertedMark?.mark.attrs.id ||
          i.commentId === deletionMark?.mark.attrs.id ||
          i.commentId === formatMark?.mark.attrs.id,
      );
      const isLastIteration = trackedChanges.length === index + 1;

      if (foundComment) {
        if (isLastIteration) {
          tr.setMeta(CommentsPluginKey, { type: 'force' });
        }
        return;
      }

      if (insertedMark || deletionMark || formatMark) {
        const trackChangesPayload = {
          ...(insertedMark && { insertedMark: insertedMark.mark }),
          ...(deletionMark && { deletionMark: deletionMark.mark }),
          ...(formatMark && { formatMark: formatMark.mark }),
        };

        if (isLastIteration) tr.setMeta(CommentsPluginKey, { type: 'force' });
        tr.setMeta(CommentsPluginKey, { type: 'forceTrackChanges' });
        tr.setMeta(TrackChangesBasePluginKey, trackChangesPayload);
      }
      dispatch(tr);
    });
  };

  const translateCommentsForExport = () => {
    const processedComments = [];
    commentsList.value.forEach((comment) => {
      const values = comment.getValues();
      const richText = values.commentText;
      // If this comment originated from DOCX (Word or Google Docs), prefer the
      // original DOCX-schema JSON captured at import time. Otherwise, fall back
      // to rebuilding commentJSON from the rich-text HTML.
      const schema = values.docxCommentJSON || convertHtmlToSchema(richText);
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
    return editor.getJSON().content[0];
  };

  /**
   * Triggered when the editor locations are updated
   * Updates floating comment locations from the editor
   *
   * @param {DOMElement} parentElement The parent element of the editor
   * @returns {void}
   */
  const handleEditorLocationsUpdate = (allCommentPositions) => {
    editorCommentPositions.value = allCommentPositions || {};
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
        const keys = Object.keys(editorCommentPositions.value);
        const isPdfComment = c.selection?.source !== 'super-editor';
        if (isPdfComment) return true;
        const commentKey = c.commentId || c.importedId;
        return keys.includes(commentKey);
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

  const getHtmlFromComment = (commentTextJson) => {
    // If no content, we can't convert and its not a valid comment
    if (!commentTextJson.content?.length) return;

    try {
      const normalizedContent = normalizeCommentForEditor(commentTextJson);
      const schemaContent = Array.isArray(normalizedContent) ? normalizedContent[0] : normalizedContent;
      if (!schemaContent.content.length) return null;
      const editor = new Editor({
        mode: 'text',
        isHeadless: true,
        content: schemaContent,
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
    getCommentPosition,
    getCommentAnchoredText,
    getCommentAnchorData,

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
  };
});
