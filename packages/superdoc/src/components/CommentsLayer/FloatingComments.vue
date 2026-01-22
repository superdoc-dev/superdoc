<script setup>
import { storeToRefs } from 'pinia';
import { ref, computed, watchEffect, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { useCommentsStore } from '@superdoc/stores/comments-store';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import CommentDialog from '@superdoc/components/CommentsLayer/CommentDialog.vue';
import { PresentationEditor } from '@superdoc/super-editor';

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
const commentsRenderKey = ref(0);
const measurementTimeoutId = ref(null);
const pageContainerRefs = ref({});
const pagePositions = ref({});

const getCommentPosition = computed(() => (comment) => {
  if (!floatingCommentsContainer.value) return { top: '0px' };
  if (typeof comment.top !== 'number' || isNaN(comment.top)) {
    return { display: 'none' };
  }
  return { top: `${comment.top}px` };
});

// Group comments by page
const commentsByPage = computed(() => {
  const grouped = {};

  renderedSizes.value.forEach((comment) => {
    const pageIndex = comment.pageIndex ?? 0;
    if (!grouped[pageIndex]) {
      grouped[pageIndex] = [];
    }
    grouped[pageIndex].push(comment);
  });

  return grouped;
});

// Calculate page container positions and heights
const calculatePagePositions = () => {
  const presentation = PresentationEditor.getInstance(props.currentDocument.id);
  if (!presentation) return {};

  const pages = presentation.getPages();
  const positions = {};

  pages.forEach((page, index) => {
    // Page bounds give us the position and dimensions
    // Each page container should align with its corresponding document page
    const pageBounds = page.bounds || page;
    positions[index] = {
      top: pageBounds.y || index * 1056, // fallback: approximate page height with gap
      height: pageBounds.h || pageBounds.height || 1056,
      pageIndex: index,
    };
  });

  return positions;
};

// Get style for each page comment container
const getPageContainerStyle = computed(() => (pageIndex) => {
  const position = pagePositions.value[pageIndex];
  const gapOffset = pageIndex * 24;

  if (!position) {
    return {
      position: 'absolute',
      top: `${pageIndex * 1056 + gapOffset}px`,
      height: '1056px',
      width: '310px',
    };
  }

  return {
    position: 'absolute',
    top: `${position.top + gapOffset}px`,
    height: `${position.height}px`,
    width: '310px',
  };
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
  // Calculate page positions first
  pagePositions.value = calculatePagePositions();

  const groupedByPage = renderedSizes.value.reduce((acc, comment) => {
    const key = comment.pageIndex ?? 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(comment);
    return acc;
  }, {});

  // Process each page independently - positions are relative to page, not global
  Object.entries(groupedByPage).forEach(([pageIndexStr, comments]) => {
    const pageIndex = parseInt(pageIndexStr);
    const pagePos = pagePositions.value[pageIndex];
    const pageTop = pagePos?.top || 0;

    // Normalize comment positions relative to the page
    comments.forEach((comment) => {
      // Comment top is absolute, make it relative to page
      comment.relativeTop = comment.top - pageTop;
    });

    // Sort and adjust within page
    comments
      .sort((a, b) => a.relativeTop - b.relativeTop)
      .forEach((comment, idx, arr) => {
        if (idx === 0) return;
        const prev = arr[idx - 1];
        const minTop = prev.relativeTop + prev.height + 15;
        if (comment.relativeTop < minTop) {
          comment.relativeTop = minTop;
        }
      });

    // Update the actual top for rendering
    comments.forEach((comment) => {
      comment.top = comment.relativeTop;
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

    <!-- Second group: Render by page after first group is processed -->
    <div v-if="firstGroupRendered" class="page-comments-wrapper">
      <div
        v-for="(comments, pageIndex) in commentsByPage"
        :key="`page-${pageIndex}`"
        class="page-comments-container"
        :data-page-index="pageIndex"
        :style="getPageContainerStyle(pageIndex)"
        :ref="
          (el) => {
            if (el) pageContainerRefs[pageIndex] = el;
          }
        "
      >
        <div
          v-for="comment in comments"
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
.comments-dialog {
  position: absolute;
  min-width: 290px;
}
.calculation-container {
  visibility: hidden;
  position: fixed;
  left: -9999px;
  top: -9999px;
}

/* Page-wise comments layout */
.page-comments-wrapper {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
}

.page-comments-container {
  position: absolute;
  width: 310px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  box-sizing: border-box;
  /* Each page container is positioned to align with its document page */
  /* Comments within are positioned relative to their page container */
  /* Independent scrolling per page if content exceeds page height */
}

.page-comments-container::-webkit-scrollbar {
  width: 6px;
}

.page-comments-container::-webkit-scrollbar-track {
  background: transparent;
}

.page-comments-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.page-comments-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>
