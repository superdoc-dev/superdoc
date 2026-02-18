<script setup>
import { storeToRefs } from 'pinia';
import { ref, computed, watchEffect, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { useCommentsStore } from '@superdoc/stores/comments-store';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import CommentDialog from '@superdoc/components/CommentsLayer/CommentDialog.vue';

const props = defineProps({
  currentDocument: {
    type: Object,
    required: true,
  },
  parent: {
    type: Object,
    required: true,
  },
});

const superdocStore = useSuperdocStore();
const commentsStore = useCommentsStore();

const { getFloatingComments, hasInitializedLocations, activeComment, commentsList, editorCommentPositions } =
  storeToRefs(commentsStore);

const floatingCommentsContainer = ref(null);
const renderedSizes = ref([]);
const firstGroupRendered = ref(false);
const verticalOffset = ref(0);
const commentsRenderKey = ref(0);
const measurementTimeoutId = ref(null);

const getCommentPosition = computed(() => (comment) => {
  if (!floatingCommentsContainer.value) return { top: '0px' };
  if (typeof comment.top !== 'number' || isNaN(comment.top)) {
    return { display: 'none' };
  }
  return { top: `${comment.top}px` };
});

const handleDialog = (dialog) => {
  if (!dialog) return;
  const { elementRef, commentId } = dialog;
  if (!elementRef) return;

  nextTick(() => {
    const id = commentId;
    if (renderedSizes.value.some((item) => item.id == id)) return;

    const comment = getFloatingComments.value.find((c) => c.commentId === id || c.importedId == id);
    const positionKey = id || comment?.importedId;
    const positionEntry = editorCommentPositions.value[positionKey];
    const position = positionEntry?.bounds || {};

    // If this is a PDF, set the position based on selection bounds
    if (props.currentDocument.type === 'application/pdf') {
      Object.entries(comment.selection?.selectionBounds).forEach(([key, value]) => {
        position[key] = Number(value);
      });
    }

    if (!position) return;

    const bounds = elementRef.value?.getBoundingClientRect();
    const top = Number(position.top);
    if (!Number.isFinite(top)) return;
    const placement = {
      id,
      top,
      height: bounds.height,
      commentRef: comment,
      elementRef,
      pageIndex: positionEntry?.pageIndex ?? 0,
    };
    renderedSizes.value.push(placement);
  });
};

const processLocations = async () => {
  const groupedByPage = renderedSizes.value.reduce((acc, comment) => {
    const key = comment.pageIndex ?? 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(comment);
    return acc;
  }, {});

  Object.values(groupedByPage).forEach((comments) => {
    comments
      .sort((a, b) => a.top - b.top)
      .forEach((comment, idx, arr) => {
        if (idx === 0) return;
        const prev = arr[idx - 1];
        const minTop = prev.top + prev.height + 15;
        if (comment.top < minTop) {
          comment.top = minTop;
        }
      });
  });

  await nextTick();
  firstGroupRendered.value = true;
};

// Ensures floating comments update after all are measured
// Falls back to rendering what we have after a timeout if some comments fail to get positions
watchEffect(() => {
  // Clear any pending timeout
  if (measurementTimeoutId.value) {
    clearTimeout(measurementTimeoutId.value);
    measurementTimeoutId.value = null;
  }

  const totalComments = getFloatingComments.value.length;
  const measuredComments = renderedSizes.value.length;

  if (totalComments === 0 || measuredComments === 0) {
    return;
  }

  nextTick(processLocations);
});

watch(activeComment, (newVal, oldVal) => {
  nextTick(() => {
    if (!activeComment.value) return (verticalOffset.value = 0);

    const comment = commentsStore.getComment(activeComment.value);
    if (!comment) return (verticalOffset.value = 0);
    const commentKey = comment.commentId || comment.importedId;
    const renderedItem = renderedSizes.value.find((item) => item.id === commentKey);
    if (!renderedItem) return (verticalOffset.value = 0);

    const selectionTop = comment.selection.selectionBounds.top;
    const renderedTop = renderedItem.top;

    const editorBounds = floatingCommentsContainer.value.getBoundingClientRect();
    verticalOffset.value = selectionTop - renderedTop;

    setTimeout(() => {
      renderedItem.elementRef?.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 200);
  });
});

onBeforeUnmount(() => {
  // Clean up pending timeout to prevent memory leak
  if (measurementTimeoutId.value) {
    clearTimeout(measurementTimeoutId.value);
    measurementTimeoutId.value = null;
  }
});
</script>

<template>
  <div class="section-wrapper" ref="floatingCommentsContainer">
    <!-- First group: Detecting heights -->
    <div class="sidebar-container calculation-container">
      <div v-for="comment in getFloatingComments" :key="comment.commentId || comment.importedId">
        <div :id="comment.commentId || comment.importedId" class="measure-comment">
          <CommentDialog
            @ready="handleDialog"
            :key="comment.commentId + commentsRenderKey"
            class="floating-comment"
            :parent="parent"
            :comment="comment"
          />
        </div>
      </div>
    </div>

    <!-- Second group: Render only after first group is processed -->
    <div v-if="firstGroupRendered" class="sidebar-container" :style="{ top: verticalOffset + 'px' }">
      <div
        v-for="comment in renderedSizes"
        :key="comment.id"
        :style="getCommentPosition(comment)"
        class="floating-comment"
      >
        <CommentDialog
          :key="comment.id + commentsRenderKey"
          class="floating-comment"
          :parent="parent"
          :comment="comment.commentRef"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.measure-comment {
  box-sizing: border-box;
  height: auto;
}
.floating-comment {
  position: absolute;
  display: block;
}
.sidebar-container {
  position: absolute;
  width: 300px;
  min-height: 300px;
}
.section-wrapper {
  position: relative;
  min-height: 100%;
  width: 300px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}
.floating-comment {
  position: absolute;
  min-width: 300px;
}
.calculation-container {
  visibility: hidden;
  position: fixed;
  left: -9999px;
  top: -9999px;
}
</style>
