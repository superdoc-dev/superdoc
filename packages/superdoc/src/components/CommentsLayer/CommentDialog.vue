<script setup>
import { computed, ref, getCurrentInstance, onMounted, nextTick, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useCommentsStore } from '@superdoc/stores/comments-store';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import { superdocIcons } from '@superdoc/icons.js';
import InternalDropdown from './InternalDropdown.vue';
import CommentHeader from './CommentHeader.vue';
import CommentInput from './CommentInput.vue';
import Avatar from '@superdoc/components/general/Avatar.vue';

const emit = defineEmits(['click-outside', 'ready', 'dialog-exit', 'resize']);
const props = defineProps({
  comment: {
    type: Object,
    required: true,
  },
  autoFocus: {
    type: Boolean,
    default: false,
  },
  parent: {
    type: Object,
    required: false,
  },
});

const { proxy } = getCurrentInstance();
const superdocStore = useSuperdocStore();
const commentsStore = useCommentsStore();

/* Comments store refs */
const { addComment, cancelComment, deleteComment, removePendingComment } = commentsStore;
const {
  suppressInternalExternal,
  getConfig,
  activeComment,
  floatingCommentsOffset,
  pendingComment,
  currentCommentText,
  isDebugging,
  editingCommentId,
  editorCommentPositions,
  isCommentHighlighted,
} = storeToRefs(commentsStore);

const isInternal = ref(true);
const commentInput = ref(null);
const editCommentInputs = ref(new Map());

const setEditCommentInputRef = (commentId) => (el) => {
  if (!commentId) return;
  if (el) {
    editCommentInputs.value.set(commentId, el);
    if (editingCommentId.value === commentId) {
      nextTick(() => {
        focusEditInput(commentId);
      });
    }
  } else {
    editCommentInputs.value.delete(commentId);
  }
};

const focusEditInput = (commentId) => {
  const input = editCommentInputs.value.get(commentId);
  input?.focus?.();
};
const commentDialogElement = ref(null);

const isActiveComment = computed(() => activeComment.value === props.comment.commentId);

/* ── Step 1: Resolved badge ── */
const resolvedBadgeLabel = computed(() => {
  if (!props.comment.resolvedTime) return null;
  return props.comment.trackedChange ? 'Accepted' : 'Resolved';
});

/* ── Pending new comment (brand-new, not a reply) ── */
const isPendingNewComment = computed(() => {
  return pendingComment.value && pendingComment.value.commentId === props.comment.commentId;
});

const showButtons = computed(() => {
  return (
    !getConfig.readOnly &&
    isActiveComment.value &&
    !props.comment.resolvedTime &&
    editingCommentId.value !== props.comment.commentId
  );
});

const showSeparator = computed(() => (index) => {
  const visible = visibleComments.value;
  if (showInputSection.value && index === visible.length - 1) return true;
  return visible.length > 1 && index !== visible.length - 1;
});

const showInputSection = computed(() => {
  return (
    !getConfig.readOnly &&
    isActiveComment.value &&
    !props.comment.resolvedTime &&
    editingCommentId.value !== props.comment.commentId
  );
});

// Reply pill → expanded editor toggle
const isReplying = ref(false);
const startReply = () => {
  isReplying.value = true;
  nextTick(() => {
    commentInput.value?.focus?.();
    emit('resize');
  });
};

const isRangeThreadedComment = (comment) => {
  if (!comment) return false;
  return (
    comment.threadingStyleOverride === 'range-based' ||
    comment.threadingMethod === 'range-based' ||
    comment.originalXmlStructure?.hasCommentsExtended === false
  );
};

const collectTrackedChangeThread = (parentComment, allComments) => {
  const trackedChangeId = parentComment.commentId;
  const threadIds = new Set([trackedChangeId]);
  const queue = [];

  allComments.forEach((comment) => {
    if (comment.commentId === trackedChangeId) return;
    const isDirectChild = comment.parentCommentId === trackedChangeId;
    const isRangeBasedTrackedChangeComment =
      comment.trackedChangeParentId === trackedChangeId && isRangeThreadedComment(comment);

    if (isDirectChild || isRangeBasedTrackedChangeComment) {
      threadIds.add(comment.commentId);
      queue.push(comment.commentId);
    }
  });

  for (let i = 0; i < queue.length; i += 1) {
    const parentId = queue[i];
    allComments.forEach((comment) => {
      if (comment.parentCommentId === parentId && !threadIds.has(comment.commentId)) {
        threadIds.add(comment.commentId);
        queue.push(comment.commentId);
      }
    });
  }

  return allComments.filter((comment) => threadIds.has(comment.commentId));
};

const comments = computed(() => {
  const parentComment = props.comment;
  const allComments = commentsStore.commentsList;
  const threadComments = parentComment.trackedChange
    ? collectTrackedChangeThread(parentComment, allComments)
    : allComments.filter((comment) => {
        const isThreadedComment = comment.parentCommentId === parentComment.commentId;
        const isThisComment = comment.commentId === parentComment.commentId;
        return isThreadedComment || isThisComment;
      });

  return threadComments.sort((a, b) => {
    // Parent comment (the one passed as prop) should always be first
    if (a.commentId === parentComment.commentId) return -1;
    if (b.commentId === parentComment.commentId) return 1;
    // Sort remaining comments (children) by creation time
    return a.createdTime - b.createdTime;
  });
});

/* ── Step 2: Text truncation ── */
const textExpanded = ref(false);
const parentBodyRef = ref(null);
const isTextOverflowing = ref(false);
const shouldTruncate = computed(() => !textExpanded.value);
const toggleTruncation = () => {
  textExpanded.value = !textExpanded.value;
  nextTick(() => emit('resize'));
};
const checkOverflow = () => {
  // Only measure when the clamp is active (initial state)
  if (textExpanded.value) return;
  const el = parentBodyRef.value;
  if (!el) {
    isTextOverflowing.value = false;
    return;
  }
  isTextOverflowing.value = el.scrollHeight > el.clientHeight + 1;
};
// Check overflow when the element first renders
watch(parentBodyRef, () => {
  nextTick(checkOverflow);
});
// Reset truncation, thread collapse, and reply state when card becomes inactive
watch(isActiveComment, (active) => {
  if (!active) {
    textExpanded.value = false;
    threadExpanded.value = false;
    isReplying.value = false;
    nextTick(() => emit('resize'));
  }
});

/* ── Step 3: Thread collapse ──
 * >=2 replies → collapse: parent + "N more replies" + last reply
 * <2 replies  → show all
 * Clicking "N more replies" or the card → expand all + activate
 * Deactivating → re-collapse
 */
const threadExpanded = ref(false);
const childComments = computed(() => comments.value.slice(1));

const shouldCollapseThread = computed(() => {
  if (threadExpanded.value) return false;
  return childComments.value.length >= 2;
});

const visibleComments = computed(() => {
  if (!shouldCollapseThread.value) return comments.value;
  // Collapsed: parent + last reply
  const parent = comments.value[0];
  const last = childComments.value[childComments.value.length - 1];
  return [parent, last].filter(Boolean);
});

const collapsedReplyCount = computed(() => {
  if (!shouldCollapseThread.value) return 0;
  return childComments.value.length - 1; // only last is shown
});

const collapsedReplyAuthors = computed(() => {
  if (!shouldCollapseThread.value) return [];
  // Hidden = all replies except last
  const hidden = childComments.value.slice(0, -1);
  const seen = new Set();
  return hidden
    .map((c) =>
      typeof c.getCommentUser === 'function'
        ? c.getCommentUser()
        : { name: c.creatorName, email: c.creatorEmail || c.email },
    )
    .filter((u) => {
      if (!u) return false;
      const key = u.email || u.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
});

const expandThread = () => {
  threadExpanded.value = true;
  setFocus();
  nextTick(() => emit('resize'));
};

const isInternalDropdownDisabled = computed(() => {
  if (props.comment.resolvedTime) return true;
  return getConfig.value.readOnly;
});

const isEditingThisComment = computed(() => (comment) => editingCommentId.value === comment.commentId);

const shouldShowInternalExternal = computed(() => {
  if (!proxy.$superdoc.config.isInternal) return false;
  return !suppressInternalExternal.value && !props.comment.trackedChange;
});

const hasTextContent = computed(() => {
  return currentCommentText.value && currentCommentText.value !== '<p></p>';
});

const setFocus = () => {
  const editor = proxy.$superdoc.activeEditor;

  // Only set as active if not resolved (resolved comments can't be edited)
  if (!props.comment.resolvedTime) {
    activeComment.value = props.comment.commentId;
    props.comment.setActive(proxy.$superdoc);
  }

  // Always allow scrolling to the comment location, even for resolved comments
  if (editor) {
    // For resolved comments, use commentId since prepareCommentsForImport rewrites
    // commentRangeStart/End nodes' w:id to the internal commentId (not importedId)
    const cursorId = props.comment.resolvedTime
      ? props.comment.commentId
      : props.comment.importedId || props.comment.commentId;
    editor.commands?.setCursorById(cursorId);
  }
};

const handleClickOutside = (e) => {
  const targetElement = e.target instanceof Element ? e.target : e.target?.parentElement;
  const clickedIgnoredTarget = targetElement?.closest?.(
    [
      '.n-dropdown-option-body__label',
      '.superdoc-comment-highlight',
      '.sd-editor-comment-highlight',
      '.sd-editor-tracked-change-highlight',
      '.track-insert',
      '.track-insert-dec',
      '.track-delete',
      '.track-delete-dec',
      '.track-format',
      '.track-format-dec',
    ].join(','),
  );

  if (clickedIgnoredTarget || isCommentHighlighted.value) return;

  // If clicked on another comment dialog, let that dialog's setFocus handle activation.
  // Without this, the outgoing dialog clears activeComment before the new dialog can set it.
  if (e.target.closest?.('.comments-dialog') && !commentDialogElement.value?.contains(e.target)) return;

  // Cancel the pending new comment on click-outside
  if (isPendingNewComment.value) {
    cancelComment(proxy.$superdoc);
    return;
  }

  if (activeComment.value === props.comment.commentId) {
    floatingCommentsOffset.value = 0;
    emit('dialog-exit');
  }
  activeComment.value = null;
  commentsStore.setActiveComment(proxy.$superdoc, activeComment.value);
  isCommentHighlighted.value = false;
};

const handleAddComment = () => {
  const options = {
    documentId: props.comment.fileId,
    isInternal: pendingComment.value ? pendingComment.value.isInternal : isInternal.value,
    parentCommentId: pendingComment.value ? null : props.comment.commentId,
  };

  if (pendingComment.value) {
    const selection = pendingComment.value.selection.getValues();
    options.selection = selection;
  }

  const comment = commentsStore.getPendingComment(options);
  addComment({ superdoc: proxy.$superdoc, comment });
};

const handleReject = () => {
  const customHandler = proxy.$superdoc.config.onTrackedChangeBubbleReject;

  if (props.comment.trackedChange && typeof customHandler === 'function') {
    customHandler(props.comment, proxy.$superdoc.activeEditor);
  } else if (props.comment.trackedChange) {
    proxy.$superdoc.activeEditor.commands.rejectTrackedChangeById(props.comment.commentId);
  } else {
    commentsStore.deleteComment({ superdoc: proxy.$superdoc, commentId: props.comment.commentId });
  }

  // Always resolve tracked changes so resolvedTime is set and the bubble
  // disappears from getFloatingComments — even when a custom handler is used (SD-2049).
  if (props.comment.trackedChange) {
    props.comment.resolveComment({
      email: superdocStore.user.email,
      name: superdocStore.user.name,
      superdoc: proxy.$superdoc,
    });
  }

  // Always cleanup the dialog state
  nextTick(() => {
    commentsStore.lastUpdate = new Date();
    activeComment.value = null;
    commentsStore.setActiveComment(proxy.$superdoc, activeComment.value);
  });
};

const handleResolve = () => {
  const customHandler = proxy.$superdoc.config.onTrackedChangeBubbleAccept;

  if (props.comment.trackedChange && typeof customHandler === 'function') {
    customHandler(props.comment, proxy.$superdoc.activeEditor);
  } else {
    if (props.comment.trackedChange) {
      proxy.$superdoc.activeEditor.commands.acceptTrackedChangeById(props.comment.commentId);
    }
  }

  // Always resolve so resolvedTime is set and the bubble disappears
  // from getFloatingComments — even when a custom handler is used (SD-2049).
  props.comment.resolveComment({
    email: superdocStore.user.email,
    name: superdocStore.user.name,
    superdoc: proxy.$superdoc,
  });

  // Always cleanup the dialog state
  nextTick(() => {
    commentsStore.lastUpdate = new Date();
    activeComment.value = null;
    commentsStore.setActiveComment(proxy.$superdoc, activeComment.value);
  });
};

const handleOverflowSelect = (value, comment) => {
  switch (value) {
    case 'edit':
      currentCommentText.value = comment?.commentText?.value ?? comment?.commentText ?? '';
      activeComment.value = comment.commentId;
      editingCommentId.value = comment.commentId;
      commentsStore.setActiveComment(proxy.$superdoc, activeComment.value);
      nextTick(() => {
        focusEditInput(comment.commentId);
      });
      break;
    case 'delete':
      deleteComment({ superdoc: proxy.$superdoc, commentId: comment.commentId });
      break;
  }
};

const handleCommentUpdate = (comment) => {
  editingCommentId.value = null;
  comment.setText({ text: currentCommentText.value, superdoc: proxy.$superdoc });
  removePendingComment(proxy.$superdoc);
};

const handleInternalExternalSelect = (value) => {
  const isPendingComment = !!pendingComment.value;
  const isInternal = value.toLowerCase() === 'internal';

  if (!isPendingComment) props.comment.setIsInternal({ isInternal: isInternal, superdoc: proxy.$superdoc });
  else pendingComment.value.isInternal = isInternal;
};

const getSidebarCommentStyle = computed(() => {
  const style = {};

  if (isActiveComment.value || isPendingNewComment.value) {
    style.zIndex = 50;
  }

  return style;
});

const getProcessedDate = (timestamp) => {
  const isString = typeof timestamp === 'string';
  return isString ? new Date(timestamp).getTime() : timestamp;
};

const handleCancel = (comment) => {
  editingCommentId.value = null;
  cancelComment(proxy.$superdoc);
};

const usersFiltered = computed(() => {
  const users = proxy.$superdoc.users;

  if (props.comment.isInternal === true) {
    return users.filter((user) => user.access?.role === 'internal');
  }

  return users;
});

onMounted(() => {
  if (props.autoFocus) {
    nextTick(() => setFocus());
  }

  // Auto-focus the input for pending new comments
  if (isPendingNewComment.value) {
    nextTick(() => {
      commentInput.value?.focus?.();
    });
  }

  nextTick(() => {
    const commentId = props.comment.importedId !== undefined ? props.comment.importedId : props.comment.commentId;
    emit('ready', { commentId, elementRef: commentDialogElement });
    checkOverflow();
  });
});

watch(
  showInputSection,
  (isVisible) => {
    if (!isVisible) return;
    nextTick(() => {
      commentInput.value?.focus?.();
    });
  },
  { immediate: true },
);

watch(editingCommentId, (commentId) => {
  if (!commentId) return;
  const entry = comments.value.find((comment) => comment.commentId === commentId);
  if (!entry || entry.trackedChange) return;
  nextTick(() => {
    focusEditInput(commentId);
  });
});
</script>

<template>
  <div
    class="comments-dialog"
    :class="{ 'is-active': isActiveComment || isPendingNewComment, 'is-resolved': props.comment.resolvedTime }"
    v-click-outside="handleClickOutside"
    @click.stop.prevent="setFocus"
    :style="getSidebarCommentStyle"
    ref="commentDialogElement"
    role="dialog"
  >
    <!-- ── New comment card (pending) ── -->
    <template v-if="isPendingNewComment">
      <div v-if="shouldShowInternalExternal" class="existing-internal-input">
        <InternalDropdown
          @click.stop.prevent
          class="internal-dropdown"
          :is-disabled="false"
          :state="pendingComment.isInternal ? 'internal' : 'external'"
          @select="handleInternalExternalSelect"
        />
      </div>

      <CommentHeader :config="getConfig" :comment="props.comment" :is-pending-input="true" />

      <div class="new-comment-input-wrapper">
        <CommentInput
          ref="commentInput"
          :users="usersFiltered"
          :config="getConfig"
          :comment="props.comment"
          :include-header="false"
        />
      </div>
      <div class="reply-actions">
        <button class="sd-button reply-btn-cancel" @click.stop.prevent="handleCancel">Cancel</button>
        <button
          class="sd-button primary reply-btn-primary"
          @click.stop.prevent="handleAddComment"
          :disabled="!hasTextContent"
          :class="{ 'is-disabled': !hasTextContent }"
        >
          Comment
        </button>
      </div>
    </template>

    <!-- ── Existing comment card ── -->
    <template v-else>
      <!-- Resolved badge -->
      <div v-if="resolvedBadgeLabel" class="resolved-badge">
        <span class="resolved-badge__icon" v-html="superdocIcons.markDone"></span>
        {{ resolvedBadgeLabel }}
      </div>

      <div v-if="shouldShowInternalExternal" class="existing-internal-input">
        <InternalDropdown
          @click.stop.prevent
          class="internal-dropdown"
          :is-disabled="isInternalDropdownDisabled"
          :state="comment.isInternal ? 'internal' : 'external'"
          @select="handleInternalExternalSelect"
        />
      </div>

      <!-- Comments and their threaded (sub) comments are rendered here -->
      <div v-for="(comment, index) in visibleComments" :key="comment.commentId" class="conversation-item">
        <CommentHeader
          :config="getConfig"
          :timestamp="getProcessedDate(comment.createdTime)"
          :comment="comment"
          :is-active="isActiveComment"
          @resolve="handleResolve"
          @reject="handleReject"
          @overflow-select="handleOverflowSelect($event, comment)"
        />

        <div class="card-section comment-body" v-if="comment.trackedChange">
          <div
            class="tracked-change"
            :class="{ 'is-truncated': shouldTruncate && index === 0 }"
            :ref="index === 0 ? (el) => (parentBodyRef = el) : undefined"
          >
            <div v-if="comment.trackedChangeType === 'trackFormat'">
              <span class="change-type">Format: </span>
              <span class="tracked-change-text">{{ comment.trackedChangeText }}</span>
            </div>
            <div v-else-if="comment.trackedChangeType === 'both'">
              <span class="change-type">Replaced </span>
              <span class="tracked-change-text is-deleted">"{{ comment.deletedText }}"</span>
              <span class="change-type"> with </span>
              <span class="tracked-change-text is-inserted">"{{ comment.trackedChangeText }}"</span>
            </div>
            <div v-else-if="comment.deletedText">
              <span class="change-type">Deleted </span>
              <span class="tracked-change-text is-deleted">"{{ comment.deletedText }}"</span>
            </div>
            <div v-else-if="comment.trackedChangeText">
              <span class="change-type">Added </span>
              <span class="tracked-change-text is-inserted">"{{ comment.trackedChangeText }}"</span>
            </div>
          </div>
          <div
            v-if="shouldTruncate && isTextOverflowing && index === 0"
            class="show-more-toggle"
            @click.stop.prevent="toggleTruncation"
          >
            Show more
          </div>
          <div
            v-if="textExpanded && isTextOverflowing && index === 0"
            class="show-more-toggle"
            @click.stop.prevent="toggleTruncation"
          >
            Show less
          </div>
        </div>

        <!-- Show the comment text, unless we enter edit mode, then show an input and update buttons -->
        <div class="card-section comment-body" v-if="!comment.trackedChange">
          <div
            v-if="!isDebugging && !isEditingThisComment(comment)"
            class="comment"
            :class="{ 'is-truncated': shouldTruncate && index === 0 }"
            :ref="index === 0 ? (el) => (parentBodyRef = el) : undefined"
            v-html="comment.commentText"
          ></div>
          <div v-else-if="isDebugging && !isEditingThisComment(comment)" class="comment">
            {{
              editorCommentPositions[comment.importedId !== undefined ? comment.importedId : comment.commentId]?.bounds
            }}
          </div>
          <div v-else class="comment-editing">
            <CommentInput
              :ref="setEditCommentInputRef(comment.commentId)"
              :users="usersFiltered"
              :config="getConfig"
              :include-header="false"
              :comment="comment"
            />
            <div class="comment-footer">
              <button class="sd-button" @click.stop.prevent="handleCancel(comment)">Cancel</button>
              <button class="sd-button primary" @click.stop.prevent="handleCommentUpdate(comment)">Update</button>
            </div>
          </div>
          <div
            v-if="shouldTruncate && isTextOverflowing && index === 0 && !isEditingThisComment(comment)"
            class="show-more-toggle"
            @click.stop.prevent="toggleTruncation"
          >
            Show more
          </div>
          <div
            v-if="textExpanded && isTextOverflowing && index === 0 && !isEditingThisComment(comment)"
            class="show-more-toggle"
            @click.stop.prevent="toggleTruncation"
          >
            Show less
          </div>
        </div>

        <!-- Thread collapse: after parent (index 0), show "N more replies" -->
        <template v-if="shouldCollapseThread && index === 0">
          <div class="comment-separator"></div>
          <div class="collapsed-replies" @click.stop.prevent="expandThread">
            <div class="collapsed-avatars">
              <Avatar
                v-for="author in collapsedReplyAuthors"
                :key="author.email || author.name"
                :user="author"
                class="mini-avatar"
              />
            </div>
            <span>{{ collapsedReplyCount }} more {{ collapsedReplyCount === 1 ? 'reply' : 'replies' }}</span>
          </div>
        </template>

        <div class="comment-separator" v-if="showSeparator(index)"></div>
      </div>

      <!-- Reply area: pill that expands in-place with action buttons -->
      <template v-if="showInputSection && !getConfig.readOnly">
        <div v-if="!isReplying" class="reply-pill" @click.stop.prevent="startReply">Reply or add others with @</div>
        <div v-else class="reply-expanded">
          <div class="reply-input-wrapper">
            <CommentInput
              ref="commentInput"
              :users="usersFiltered"
              :config="getConfig"
              :comment="props.comment"
              :include-header="false"
            />
          </div>
          <div class="reply-actions">
            <button class="sd-button reply-btn-cancel" @click.stop.prevent="handleCancel">Cancel</button>
            <button
              class="sd-button primary reply-btn-primary"
              @click.stop.prevent="handleAddComment"
              :disabled="!hasTextContent"
              :class="{ 'is-disabled': !hasTextContent }"
            >
              Reply
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.comments-dialog {
  display: flex;
  flex-direction: column;
  padding: var(--sd-comment-padding, 16px);
  border-radius: var(--sd-comment-radius, 12px);
  background-color: var(--sd-comment-bg, #f3f6fd);
  border: 1px solid transparent;
  font-family: var(--sd-ui-font-family, Arial, Helvetica, sans-serif);
  font-size: var(--sd-comment-body-size, 14px);
  line-height: 1.5;
  transition: var(--sd-comment-transition, all 200ms ease);
  box-shadow: none;
  z-index: 5;
  max-width: var(--sd-comment-max-width, 300px);
  min-width: var(--sd-comment-min-width, 200px);
  width: 100%;
}
.comments-dialog:not(.is-active) {
  cursor: pointer;
}
.comments-dialog:not(.is-active):not(.is-resolved):hover {
  background-color: var(--sd-comment-bg-hover, #f3f6fd);
}
.comments-dialog:not(.is-resolved):hover :deep(.overflow-menu) {
  opacity: 1;
  pointer-events: auto;
}
.comments-dialog.is-active {
  background-color: var(--sd-comment-bg-active, #ffffff);
  border-color: var(--sd-comment-border-active, #e0e0e0);
  box-shadow: var(--sd-comment-shadow, 0px 4px 12px 0px rgba(50, 50, 50, 0.15));
  z-index: 10;
}
.comments-dialog.is-resolved {
  background-color: var(--sd-comment-bg-resolved, #f0f0f0);
}

.comment-separator {
  background-color: var(--sd-comment-separator, #e0e0e0);
  height: 1px;
  width: 100%;
  margin: 10px 0;
}

.comment {
  font-size: var(--sd-comment-body-size, 14px);
  line-height: 1.5;
  color: var(--sd-comment-author-color, #212121);
  margin: 4px 0 0 0;
}
.comment :deep(p) {
  margin: 0;
}

.tracked-change {
  font-size: var(--sd-comment-body-size, 14px);
  line-height: 1.5;
  color: var(--sd-comment-author-color, #212121);
  margin: 4px 0 0 0;
}
.change-type {
  color: var(--sd-comment-author-color, #212121);
}
.tracked-change-text {
  color: var(--sd-comment-author-color, #212121);
}
.tracked-change-text.is-deleted {
  color: var(--sd-comment-tc-delete-color, #cb0e47);
}
.tracked-change-text.is-inserted {
  color: var(--sd-comment-tc-insert-color, #00853d);
  font-weight: 500;
}

/* ── Resolved badge ── */
.resolved-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--sd-color-green-500, #00853d);
  margin-bottom: 4px;
}
.resolved-badge__icon {
  display: inline-flex;
  width: 12px;
  height: 12px;
}
.resolved-badge__icon :deep(svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

/* ── Text truncation ── */
.comment.is-truncated,
.tracked-change.is-truncated {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.show-more-toggle {
  font-size: 12px;
  color: var(--sd-action-primary, #1355ff);
  cursor: pointer;
  font-weight: 500;
  margin-top: 4px;
  user-select: none;
}
.show-more-toggle:hover {
  text-decoration: underline;
}

/* ── Thread collapse ── */
.collapsed-replies {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  font-size: 12px;
  color: var(--sd-action-primary, #1355ff);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}
.collapsed-replies:hover {
  text-decoration: underline;
}
.collapsed-avatars {
  display: flex;
}
.collapsed-avatars .mini-avatar {
  --sd-comment-avatar-size: 20px;
  --sd-comment-avatar-font-size: 8px;
  margin-left: -4px;
  border: 2px solid var(--sd-comment-bg-active, #ffffff);
}
.collapsed-avatars .mini-avatar:first-child {
  margin-left: 0;
}

/* ── New comment input ── */
.new-comment-input-wrapper {
  border: 1.5px solid var(--sd-border-default, #dbdbdb);
  border-radius: 9999px;
  padding: 8.5px 10.5px;
  background: var(--sd-surface-card, #ffffff);
  margin-top: 4px;
}
.new-comment-input-wrapper :deep(.comment-entry) {
  border-radius: 0;
}
.new-comment-input-wrapper :deep(.input-section) {
  margin: 0;
}
.new-comment-input-wrapper :deep(.superdoc-field) {
  font-size: 14px;
  border: none;
  padding: 0;
  border-radius: 0;
}
.new-comment-input-wrapper :deep(.superdoc-field:focus),
.new-comment-input-wrapper :deep(.superdoc-field:active) {
  border: none;
}
.new-comment-input-wrapper :deep(.sd-editor-placeholder::before) {
  content: 'Comment or add others with @';
}

/* ── Reply pill & expanded input ── */
.reply-pill {
  padding: 8.5px 10.5px;
  border: 1.5px solid transparent;
  border-radius: 9999px;
  font-size: 14px;
  color: var(--sd-color-gray-500, #ababab);
  background: var(--sd-color-gray-100, #f5f5f5);
  margin-top: 10px;
  cursor: text;
  transition: background 150ms ease;
}
.reply-pill:hover {
  background: var(--sd-color-gray-200, #f2f2f2);
}
.reply-expanded {
  margin-top: 10px;
}
.reply-input-wrapper {
  border: 1.5px solid var(--sd-border-default, #dbdbdb);
  border-radius: 9999px;
  padding: 8.5px 10.5px;
  background: var(--sd-surface-card, #ffffff);
}
.reply-input-wrapper :deep(.comment-entry) {
  border-radius: 0;
}
.reply-input-wrapper :deep(.input-section) {
  margin: 0;
}
.reply-input-wrapper :deep(.superdoc-field) {
  font-size: 14px;
  border: none;
  padding: 0;
  border-radius: 0;
}
.reply-input-wrapper :deep(.superdoc-field:focus),
.reply-input-wrapper :deep(.superdoc-field:active) {
  border: none;
}
.reply-input-wrapper :deep(.sd-editor-placeholder::before) {
  content: 'Reply or add others with @';
}
.reply-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
}
.reply-btn-cancel {
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--sd-color-gray-700, #666666);
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  transition: color 150ms;
}
.reply-btn-cancel:hover {
  color: var(--sd-color-gray-900, #212121);
}
.reply-btn-primary {
  background: var(--sd-action-primary, #1355ff);
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  padding: 6px 16px;
  border-radius: 9999px;
  font-family: inherit;
  transition: background 150ms;
}
.reply-btn-primary:hover {
  background: var(--sd-action-primary-hover, #0f44cc);
}
.reply-btn-primary.is-disabled {
  background: var(--sd-color-gray-400, #dbdbdb);
  color: var(--sd-color-gray-600, #888888);
  cursor: default;
  pointer-events: none;
}

.existing-internal-input {
  margin-bottom: 10px;
}

.comment-footer {
  margin: 5px 0 5px;
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
.comment-footer .sd-button {
  font-size: 12px;
  margin-left: 5px;
}

.internal-dropdown {
  display: inline-block;
}
.comment-editing {
  padding-bottom: 10px;
}
.comment-editing button {
  margin-left: 5px;
}
</style>
