<script setup>
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue';
import { useCommentsStore } from '@stores/comments-store';
import CommentDialog from '../CommentDialog.vue';

const props = defineProps({
  showMainComments: {
    type: Boolean,
    default: true,
  },
  showResolvedComments: {
    type: Boolean,
    default: true,
  },
});

const commentsStore = useCommentsStore();
const { getGroupedComments, isCommentsListVisible, activeComment, pendingComment, editingCommentId } =
  storeToRefs(commentsStore);

const itemRefs = ref({});

const shouldShowResolvedComments = computed(() => {
  return props.showResolvedComments && getGroupedComments.value?.resolvedComments?.length > 0;
});

const setItemRef = (commentId) => (el) => {
  if (el) {
    itemRefs.value[commentId] = el;
  } else {
    delete itemRefs.value[commentId];
  }
};

const ensureThreadVisible = (commentId) => {
  if (!commentId) return;
  nextTick(() => {
    const element = itemRefs.value[commentId];
    element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
};

const handleDialogResize = (commentId) => {
  if (!commentId) return;
  if (
    activeComment.value !== commentId &&
    pendingComment.value?.commentId !== commentId &&
    editingCommentId.value !== commentId
  ) {
    return;
  }
  ensureThreadVisible(commentId);
};

onMounted(() => {
  isCommentsListVisible.value = true;
});

onBeforeUnmount(() => {
  isCommentsListVisible.value = false;
});

watch(activeComment, (commentId) => {
  ensureThreadVisible(commentId);
});

watch(
  () => pendingComment.value?.commentId ?? null,
  (commentId) => {
    ensureThreadVisible(commentId);
  },
);

watch(editingCommentId, (commentId) => {
  ensureThreadVisible(commentId);
});
</script>

<template>
  <div class="comments-list">
    <div v-if="showMainComments">
      <div
        v-for="comment in getGroupedComments.parentComments"
        :ref="setItemRef(comment.commentId)"
        class="comment-item"
      >
        <CommentDialog :comment="comment" @resize="handleDialogResize(comment.commentId)" />
      </div>
    </div>

    <div v-if="shouldShowResolvedComments">
      <div class="comment-title">Resolved</div>
      <div
        v-for="comment in getGroupedComments.resolvedComments"
        :ref="setItemRef(comment.commentId)"
        class="comment-item"
      >
        <CommentDialog :comment="comment" @resize="handleDialogResize(comment.commentId)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.comments-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 400px;
}
.comment-item {
  margin-bottom: 10px;
}
.comment-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 5px;
  color: #333;
}
</style>
