<script>
// Module-level cache — survives component remounts caused by hasInitializedLocations toggle
const _heightsCache = {};
</script>

<script setup>
import { storeToRefs } from 'pinia';
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { useCommentsStore } from '@superdoc/stores/comments-store';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import CommentDialog from '@superdoc/components/CommentsLayer/CommentDialog.vue';

const ESTIMATED_HEIGHT = 80;
const OBSERVER_MARGIN = 600;

// Layout algorithm: positions comments in a single column with collision avoidance.
// When a comment is active it pins at its anchor; neighbors push up/down to avoid overlap.
// If upward push produces negative tops, everything shifts down to stay on screen.
const resolveCollisions = (positions, activeIndex, gap) => {
  if (activeIndex >= 0) {
    positions[activeIndex].top = positions[activeIndex].anchorTop;

    // Below: push down from the active comment
    let cursor = positions[activeIndex].top + positions[activeIndex].height + gap;
    for (let i = activeIndex + 1; i < positions.length; i++) {
      positions[i].top = Math.max(positions[i].anchorTop, cursor);
      cursor = positions[i].top + positions[i].height + gap;
    }

    // Above: push up from the active comment
    cursor = positions[activeIndex].top - gap;
    for (let i = activeIndex - 1; i >= 0; i--) {
      const bottomEdge = cursor - positions[i].height;
      positions[i].top = Math.min(positions[i].anchorTop, bottomEdge);
      cursor = positions[i].top - gap;
    }

    // Floor: if upward push produced negative tops, shift everything down
    const minTop = Math.min(...positions.map((p) => p.top));
    if (minTop < 0) {
      const shift = Math.abs(minTop);
      for (const p of positions) p.top += shift;
    }
  } else {
    // No active comment: simple top-to-bottom collision avoidance
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const minTop = prev.top + prev.height + gap;
      if (positions[i].top < minTop) {
        positions[i].top = minTop;
      }
    }
  }
};

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

const { getFloatingComments, activeComment, editorCommentPositions } = storeToRefs(commentsStore);
const { activeZoom } = storeToRefs(superdocStore);

const floatingCommentsContainer = ref(null);
const commentsRenderKey = ref(0);

// Resolve activeComment (which stores commentId) to the position key used by allPositions
// (which prefers importedId). Without this, imported Word comments where importedId !== commentId
// would fail the template guard and could unmount when scrolled out of the observer viewport.
const activeCommentKey = computed(() => {
  if (!activeComment.value) return null;
  const comment = commentsStore.getComment(activeComment.value);
  return comment ? commentsStore.getCommentPositionKey(comment) : null;
});

// Heights: measured (actual) or estimated. Seeded from module-level cache to
// survive remounts triggered by hasInitializedLocations toggle in SuperDoc.vue.
const measuredHeights = ref({ ..._heightsCache });

// Set of comment IDs that are near the viewport (should mount CommentDialog)
const visibleIds = ref(new Set());

// Refs for placeholder elements keyed by comment ID
const placeholderRefs = ref({});

let observer = null;

// Compute anchor position for a comment from editor position data
const getAnchorTop = (comment) => {
  const key = commentsStore.getCommentPositionKey(comment);
  const positionEntry = editorCommentPositions.value[key];

  if (props.currentDocument.type === 'application/pdf') {
    const zoom = (activeZoom.value ?? 100) / 100;
    return Number(comment.selection?.selectionBounds?.top) * zoom;
  }

  return positionEntry?.bounds?.top;
};

// Pre-compute all positions with collision avoidance
const allPositions = computed(() => {
  const comments = getFloatingComments.value;
  if (!comments.length) return [];

  const positions = [];
  for (const comment of comments) {
    const key = commentsStore.getCommentPositionKey(comment);
    const top = getAnchorTop(comment);
    if (!key || typeof top !== 'number' || isNaN(top)) continue;

    positions.push({
      id: key,
      anchorTop: top,
      top,
      height: measuredHeights.value[key] || ESTIMATED_HEIGHT,
      commentRef: comment,
    });
  }

  positions.sort((a, b) => a.anchorTop - b.anchorTop);

  const activeKey = activeCommentKey.value;
  const activeIndex = activeKey ? positions.findIndex((p) => p.id === activeKey) : -1;
  resolveCollisions(positions, activeIndex, 15);

  return positions;
});

// Total height so the sidebar container gets proper scroll height
const totalHeight = computed(() => {
  if (!allPositions.value.length) return 0;
  let max = 0;
  for (const p of allPositions.value) {
    const bottom = p.top + p.height;
    if (bottom > max) max = bottom;
  }
  return max + 50;
});

// Set up IntersectionObserver to track which placeholders are near the viewport
const setupObserver = () => {
  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      const newVisible = new Set(visibleIds.value);
      for (const entry of entries) {
        const id = entry.target.dataset.commentId;
        if (!id) continue;
        if (entry.isIntersecting) {
          newVisible.add(id);
        } else {
          newVisible.delete(id);
        }
      }
      visibleIds.value = newVisible;
    },
    {
      rootMargin: `${OBSERVER_MARGIN}px 0px ${OBSERVER_MARGIN}px 0px`,
    },
  );
};

// Observe/unobserve placeholder elements when positions change
const observePlaceholders = () => {
  if (!observer) return;
  observer.disconnect();

  for (const pos of allPositions.value) {
    const el = placeholderRefs.value[pos.id];
    if (el) observer.observe(el);
  }
};

// Store a measured height for a comment key. Deduplicates the update logic
// shared between initial mount (handleDialog) and active-state remeasure.
const storeHeight = (key, height) => {
  if (height <= 0 || height === measuredHeights.value[key]) return;
  _heightsCache[key] = height;
  measuredHeights.value = { ...measuredHeights.value, [key]: height };
};

// When a CommentDialog mounts and reports its size, record the measured height.
const handleDialog = (dialog) => {
  if (!dialog) return;
  const { elementRef, commentId: rawId } = dialog;
  if (!elementRef) return;

  nextTick(() => {
    const bounds = elementRef.value?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    const key = commentsStore.getCommentPositionKey(rawId);
    if (key) storeHeight(key, bounds.height);
  });
};

// Store placeholder ref by comment ID
const setPlaceholderRef = (id, el) => {
  if (el) {
    placeholderRefs.value[id] = el;
    if (observer) observer.observe(el);
  } else {
    delete placeholderRefs.value[id];
  }
};

// Timer IDs for cancellation on rapid active-comment switching
let remeasureTimers = [];
let scrollTimer = null;

// Re-measure when active comment changes. The active dialog expands (reply input, thread)
// and the previously active one collapses — both change height.
watch(activeCommentKey, (newKey, oldKey) => {
  // Cancel stale timers from previous activation
  remeasureTimers.forEach(clearTimeout);
  remeasureTimers = [];

  const remeasure = () => {
    for (const key of [newKey, oldKey].filter(Boolean)) {
      const el = placeholderRefs.value[key];
      if (!el) continue;
      const dialog = el.querySelector('.comments-dialog');
      if (!dialog) continue;
      storeHeight(key, dialog.getBoundingClientRect().height);
    }
  };

  // 50ms: after Vue nextTick + browser rAF settle the initial DOM change
  // 350ms: after .comment-placeholder transition (300ms ease) completes
  nextTick(() => {
    remeasureTimers.push(setTimeout(remeasure, 50));
    remeasureTimers.push(setTimeout(remeasure, 350));
  });
});

// Scroll to the active comment ONLY when its anchor is off-screen.
// getBoundingClientRect() is viewport-relative (accounts for scroll + zoom).
watch(activeComment, () => {
  if (scrollTimer) clearTimeout(scrollTimer);

  if (!activeComment.value) return;
  const comment = commentsStore.getComment(activeComment.value);
  if (!comment) return;
  const key = commentsStore.getCommentPositionKey(comment);
  if (!key) return;

  nextTick(() => {
    scrollTimer = setTimeout(() => {
      const el = placeholderRefs.value[key];
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const margin = 80;
      const isVisible = rect.top >= margin && rect.top <= window.innerHeight - margin;

      if (!isVisible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  });
});

// PDF zoom change: reset measurements
watch(activeZoom, () => {
  if (props.currentDocument.type === 'application/pdf') {
    for (const k in _heightsCache) delete _heightsCache[k];
    measuredHeights.value = {};
    commentsRenderKey.value += 1;
  }
});

// Re-observe when positions change
watch(allPositions, () => {
  nextTick(observePlaceholders);
});

onMounted(() => {
  setupObserver();
  nextTick(observePlaceholders);
});

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  // NOTE: Do NOT clear _heightsCache here. The module-level cache is designed to
  // survive remounts caused by hasInitializedLocations toggle in SuperDoc.vue.
  // Clearing it causes flickering because every remount starts with estimated heights.
});
</script>

<template>
  <div class="section-wrapper" ref="floatingCommentsContainer" :style="{ minHeight: totalHeight + 'px' }">
    <!-- sidebar-container stays at top: 0 — the layout algorithm pins the active
         comment at its anchor position directly, no offset needed -->
    <div class="sidebar-container">
      <!-- Lightweight placeholders for ALL comments (observed for viewport proximity) -->
      <div
        v-for="pos in allPositions"
        :key="pos.id"
        :ref="(el) => setPlaceholderRef(pos.id, el)"
        :data-comment-id="pos.id"
        :style="{ top: pos.top + 'px', height: pos.height + 'px' }"
        class="comment-placeholder"
      >
        <!-- Only mount the heavy CommentDialog when near the viewport -->
        <CommentDialog
          v-if="visibleIds.has(pos.id) || pos.id === activeCommentKey"
          :key="pos.id + commentsRenderKey"
          @ready="handleDialog"
          class="floating-comment"
          :parent="parent"
          :comment="pos.commentRef"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.comment-placeholder {
  position: absolute;
  width: 300px;
  transition: top 0.3s ease;
}

.floating-comment {
  position: relative;
  display: block;
  min-width: 300px;
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
</style>
