<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useCommentsStore } from '@stores/comments-store';
import ReviewDirectoryListItem from './ReviewDirectoryListItem.vue';

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
const listRoot = ref(null);
const rovingIndex = ref(0);
const isCommentsListVisible = toRef(commentsStore, 'isCommentsListVisible');
const floatingCommentInstances = computed(() => commentsStore.getFloatingCommentInstances);
const {
  activeComment,
  activeFloatingCommentInstanceId,
  commentsList,
  reviewDirectoryList,
  isReviewDirectoryActive,
  isReviewDirectoryLoading,
} = storeToRefs(commentsStore);
const groupedComments = computed(() =>
  isReviewDirectoryActive.value ? commentsStore.getGroupedReviewDirectory : commentsStore.getGroupedComments,
);
const reviewRows = computed(() => (isReviewDirectoryActive.value ? reviewDirectoryList.value : commentsList.value));

const commentAliases = (comment) =>
  [comment?.commentId, comment?.importedId, comment?.trackedChangeCanonicalId].filter((id) => id != null).map(String);

const directoryThreads = computed(() => {
  const threadsByAlias = new Map();
  for (const comment of reviewRows.value) {
    const thread = [comment];
    for (const alias of commentAliases(comment)) threadsByAlias.set(alias, thread);
  }
  for (const comment of reviewRows.value) {
    const parentAliases = [
      comment?.parentCommentId,
      comment?.threadingParentCommentId,
      comment?.trackedChangeThreadParentId,
    ]
      .filter((id) => id != null)
      .map(String);
    const parentThread = parentAliases.map((alias) => threadsByAlias.get(alias)).find(Boolean);
    if (parentThread && !parentThread.includes(comment)) parentThread.push(comment);
  }
  return threadsByAlias;
});

const threadCommentsFor = (parentComment) => {
  for (const alias of commentAliases(parentComment)) {
    const thread = directoryThreads.value.get(alias);
    if (thread) return thread;
  }
  return [parentComment];
};

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
        threadComments: threadCommentsFor(comment),
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
    threadComments: threadCommentsFor(comment),
  }));
};

const parentCommentDisplayItems = computed(() => {
  return groupedComments.value.parentComments.flatMap((comment) => buildParentCommentDisplayItems(comment));
});

const shouldShowResolvedComments = computed(() => {
  return props.showResolvedComments && groupedComments.value?.resolvedComments?.length > 0;
});

const resolvedCommentDisplayItems = computed(() =>
  groupedComments.value.resolvedComments.map((comment) => ({
    id: comment.commentId,
    comment,
    floatingInstanceId: null,
    floatingPageIndex: null,
    floatingPositionEntry: null,
    isFloatingInstanceActive: undefined,
    threadComments: threadCommentsFor(comment),
  })),
);

const displayedMainCount = computed(() => (props.showMainComments ? parentCommentDisplayItems.value.length : 0));
const totalDisplayItems = computed(
  () => displayedMainCount.value + (shouldShowResolvedComments.value ? resolvedCommentDisplayItems.value.length : 0),
);

watch(totalDisplayItems, (total) => {
  rovingIndex.value = Math.max(0, Math.min(rovingIndex.value, total - 1));
});

const focusDirectoryItem = async ({ index, key }) => {
  const lastIndex = totalDisplayItems.value - 1;
  if (lastIndex < 0) return;
  const nextIndex =
    key === 'Home'
      ? 0
      : key === 'End'
        ? lastIndex
        : key === 'ArrowUp'
          ? Math.max(0, index - 1)
          : Math.min(lastIndex, index + 1);
  rovingIndex.value = nextIndex;
  await nextTick();
  const target = listRoot.value?.querySelector?.(`[data-review-directory-index="${nextIndex}"]`);
  target?.scrollIntoView?.({ block: 'nearest' });
  target?.focus?.({ preventScroll: true });
};

onMounted(() => {
  isCommentsListVisible.value = true;
});

onBeforeUnmount(() => {
  isCommentsListVisible.value = false;
});
</script>

<template>
  <div
    ref="listRoot"
    class="comments-list"
    role="list"
    :aria-busy="isReviewDirectoryActive && isReviewDirectoryLoading ? 'true' : 'false'"
  >
    <div v-if="showMainComments">
      <ReviewDirectoryListItem
        v-for="(item, index) in parentCommentDisplayItems"
        :key="item.id"
        :item="item"
        :index="index"
        :total="totalDisplayItems"
        :tab-index="index === rovingIndex ? 0 : -1"
        @focus-item="rovingIndex = $event"
        @navigate="focusDirectoryItem"
      />
    </div>

    <div v-if="shouldShowResolvedComments">
      <div class="comment-title">Resolved</div>
      <ReviewDirectoryListItem
        v-for="(item, index) in resolvedCommentDisplayItems"
        :key="item.id"
        :item="item"
        :index="displayedMainCount + index"
        :total="totalDisplayItems"
        :tab-index="displayedMainCount + index === rovingIndex ? 0 : -1"
        @focus-item="rovingIndex = $event"
        @navigate="focusDirectoryItem"
      />
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
.comment-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 5px;
  color: #333;
}
</style>
