<script setup>
import { computed, onBeforeUnmount, onMounted, toRef } from 'vue';
import { storeToRefs } from 'pinia';
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

const REPEATED_HEADER_FOOTER_STORY_TYPE = 'headerFooterPart';

const commentsStore = useCommentsStore();
const isCommentsListVisible = toRef(commentsStore, 'isCommentsListVisible');
const groupedComments = computed(() => commentsStore.getGroupedComments);
const floatingCommentInstances = computed(() => commentsStore.getFloatingCommentInstances);
const { activeComment, activeFloatingCommentInstanceId } = storeToRefs(commentsStore);

const getRepeatedHeaderFooterInstances = (comment) => {
  const matchingInstances = floatingCommentInstances.value.filter(
    (instance) => instance?.comment?.commentId === comment?.commentId,
  );

  if (matchingInstances.length < 2) {
    return [];
  }

  if (!comment?.trackedChange) {
    return [];
  }

  if (comment?.trackedChangeStory?.storyType !== REPEATED_HEADER_FOOTER_STORY_TYPE) {
    return [];
  }

  return matchingInstances;
};

const isRepeatedInstanceActive = (instance) => {
  if (!instance?.comment?.commentId) {
    return false;
  }

  if (activeComment.value !== instance.comment.commentId) {
    return false;
  }

  if (activeFloatingCommentInstanceId.value == null) {
    return instance.isPrimary === true;
  }

  return String(activeFloatingCommentInstanceId.value) === String(instance.id);
};

const buildParentCommentDisplayItems = (comment) => {
  const repeatedInstances = getRepeatedHeaderFooterInstances(comment);
  if (!repeatedInstances.length) {
    return [
      {
        id: comment.commentId,
        comment,
        floatingInstanceId: null,
        floatingPageIndex: null,
        floatingPositionEntry: null,
        isFloatingInstanceActive: undefined,
      },
    ];
  }

  return repeatedInstances.map((instance) => ({
    id: instance.id,
    comment,
    floatingInstanceId: String(instance.id),
    floatingPageIndex: instance.pageIndex,
    floatingPositionEntry: instance.positionEntry ?? null,
    isFloatingInstanceActive: isRepeatedInstanceActive(instance),
  }));
};

const parentCommentDisplayItems = computed(() => {
  return groupedComments.value.parentComments.flatMap((comment) => buildParentCommentDisplayItems(comment));
});

const shouldShowResolvedComments = computed(() => {
  return props.showResolvedComments && groupedComments.value?.resolvedComments?.length > 0;
});

onMounted(() => {
  isCommentsListVisible.value = true;
});

onBeforeUnmount(() => {
  isCommentsListVisible.value = false;
});
</script>

<template>
  <div class="comments-list">
    <div v-if="showMainComments">
      <div
        v-for="item in parentCommentDisplayItems"
        :key="item.id"
        class="comment-item"
        :data-comment-instance-id="item.floatingInstanceId ?? ''"
        :data-comment-thread-id="item.comment.commentId ?? ''"
        :data-comment-position-key="item.comment.trackedChangeAnchorKey ?? ''"
        :data-comment-page-index="Number.isFinite(item.floatingPageIndex) ? item.floatingPageIndex : ''"
      >
        <CommentDialog
          :comment="item.comment"
          :floating-instance-id="item.floatingInstanceId"
          :floating-page-index="item.floatingPageIndex"
          :floating-position-entry="item.floatingPositionEntry"
          :is-floating-instance-active="item.isFloatingInstanceActive"
        />
      </div>
    </div>

    <div v-if="shouldShowResolvedComments">
      <div class="comment-title">Resolved</div>
      <div v-for="comment in groupedComments.resolvedComments" :key="comment.commentId" class="comment-item">
        <CommentDialog :comment="comment" />
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
