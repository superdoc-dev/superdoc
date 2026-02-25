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

    const positionEntry = editorCommentPositions.value[key];
    positions.push({
      id: key,
      anchorTop: top,
      top,
      height: measuredHeights.value[key] || ESTIMATED_HEIGHT,
      commentRef: comment,
      pageIndex: positionEntry?.pageIndex ?? 0,
    });
  }

  // Cross-page collision avoidance (Google Docs-style).
  // All comments form a single continuous column sorted by anchor position.
  // When a comment is active, it pins to its anchor and others flow around it.
  positions.sort((a, b) => a.anchorTop - b.anchorTop);

  const activeKey = activeCommentKey.value;
  const activeIndex = activeKey ? positions.findIndex((p) => p.id === activeKey) : -1;
  const gap = 15;

  if (activeIndex >= 0) {
    // Pin the active comment at its anchor position
    positions[activeIndex].top = positions[activeIndex].anchorTop;

    // Below the active: push down from the active comment
    let cursor = positions[activeIndex].top + positions[activeIndex].height + gap;
    for (let i = activeIndex + 1; i < positions.length; i++) {
      positions[i].top = Math.max(positions[i].anchorTop, cursor);
      cursor = positions[i].top + positions[i].height + gap;
    }

    // Above the active: push up from the active comment
    cursor = positions[activeIndex].top - gap;
    for (let i = activeIndex - 1; i >= 0; i--) {
      const bottomEdge = cursor - positions[i].height;
      positions[i].top = Math.min(positions[i].anchorTop, bottomEdge);
      cursor = positions[i].top - gap;
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

// When a CommentDialog mounts and reports its size, record the measured height.
// CommentDialog emits importedId when defined (prefers importedId), but allPositions
// keys by getCommentPositionKey (also prefers importedId). We normalize here to match.
const handleDialog = (dialog) => {
  if (!dialog) return;
  const { elementRef, commentId: rawId } = dialog;
  if (!elementRef) return;

  nextTick(() => {
    const bounds = elementRef.value?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;

    // Normalize to canonical key (matches allPositions)
    const key = commentsStore.getCommentPositionKey(rawId);
    if (!key) return;

    const current = measuredHeights.value[key];
    if (current !== bounds.height) {
      _heightsCache[key] = bounds.height;
      measuredHeights.value = { ...measuredHeights.value, [key]: bounds.height };
    }
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

// Vertical offset is no longer needed — the cross-page layout algorithm pins the active
// comment at its anchor position directly, so the sidebar container stays at top: 0.
const verticalOffset = computed(() => 0);

// Re-measure when active comment changes. The active dialog expands (reply input, thread)
// and the previously active one collapses — both change height. We re-measure after DOM
// updates so the layout algorithm uses the correct heights for collision avoidance.
watch(activeCommentKey, (newKey, oldKey) => {
  const remeasure = () => {
    const keys = [newKey, oldKey].filter(Boolean);
    if (!keys.length) return;

    let changed = false;
    const updates = { ...measuredHeights.value };

    for (const key of keys) {
      const el = placeholderRefs.value[key];
      if (!el) continue;
      const dialog = el.querySelector('.comments-dialog');
      if (!dialog) continue;
      const height = dialog.getBoundingClientRect().height;
      if (height > 0 && height !== updates[key]) {
        updates[key] = height;
        _heightsCache[key] = height;
        changed = true;
      }
    }

    if (changed) {
      measuredHeights.value = updates;
    }
  };

  // Two passes: first after DOM update, second after transitions settle
  nextTick(() => setTimeout(remeasure, 50));
  nextTick(() => setTimeout(remeasure, 300));
});

// Scroll to the active comment ONLY when its anchor is off-screen.
// getBoundingClientRect() is viewport-relative, so it already accounts for scroll
// position and zoom — we just need to check if it's within the visible area.
// If the anchor text is visible, do nothing — let the comments reflow in place.
watch(activeComment, () => {
  if (!activeComment.value) return;
  const comment = commentsStore.getComment(activeComment.value);
  if (!comment) return;
  const key = commentsStore.getCommentPositionKey(comment);
  if (!key) return;

  nextTick(() => {
    setTimeout(() => {
      const el = placeholderRefs.value[key];
      if (!el) return;

      // The active comment is pinned at its anchor Y, so the placeholder's
      // viewport position matches the anchor text's vertical position.
      const rect = el.getBoundingClientRect();
      const margin = 80; // buffer so it's not at the very edge
      const isVisible = rect.top >= margin && rect.top <= window.innerHeight - margin;

      if (!isVisible) {
        // Minimal scroll — just enough to bring the anchor into view
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
    <div class="sidebar-container" :style="{ top: verticalOffset + 'px' }">
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
