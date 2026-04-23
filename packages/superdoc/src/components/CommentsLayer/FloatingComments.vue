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

const ESTIMATED_HEIGHT = 110;
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
const { clearInstantSidebarAlignment } = commentsStore;

const {
  activeComment,
  activeFloatingCommentInstanceId,
  editorCommentPositions,
  pendingComment,
  editingCommentId,
  instantSidebarAlignmentTargetY,
  instantSidebarAlignmentThreadId,
  instantSidebarAlignmentInstanceId,
} = storeToRefs(commentsStore);
const { activeZoom } = storeToRefs(superdocStore);

// Access the Pinia getter directly instead of storeToRefs(). In this component
// the getter-backed ref can lag behind the live store array during rapid
// tracked-change updates, which collapses the virtualized sidebar to a stale subset.
const floatingCommentInstances = computed(() => {
  const currentFloatingCommentInstances = commentsStore.getFloatingCommentInstances;
  return Array.isArray(currentFloatingCommentInstances) ? currentFloatingCommentInstances : [];
});

const floatingCommentsContainer = ref(null);
const commentsRenderKey = ref(0);
const sidebarOffsetY = ref(0);
const disableInstantLayoutTransitions = ref(false);

const isPendingThread = (commentOrId) => {
  const pendingId = pendingComment.value?.commentId;
  if (!pendingId) return false;
  if (typeof commentOrId === 'object') return commentOrId?.commentId === pendingId;
  return commentOrId === pendingId || commentOrId === 'pending';
};

const getThreadId = (comment) => {
  return comment?.commentId ?? comment?.importedId ?? null;
};

const findPrimaryInstanceIdForThread = (threadId) => {
  if (threadId == null) {
    return null;
  }

  const normalizedThreadId = String(threadId);
  const matchingInstances = floatingCommentInstances.value.filter(
    (instance) => String(getThreadId(instance.comment)) === normalizedThreadId,
  );
  if (!matchingInstances.length) {
    return null;
  }

  return matchingInstances.find((instance) => instance.isPrimary)?.id ?? matchingInstances[0]?.id ?? null;
};

const resolveFloatingInstanceId = (threadId, preferredInstanceId = null) => {
  if (threadId == null) {
    return null;
  }

  const normalizedThreadId = String(threadId);
  const matchingInstances = floatingCommentInstances.value.filter(
    (instance) => String(getThreadId(instance.comment)) === normalizedThreadId,
  );
  if (!matchingInstances.length) {
    return null;
  }

  if (preferredInstanceId != null) {
    const preferredInstance = matchingInstances.find((instance) => String(instance.id) === String(preferredInstanceId));
    if (preferredInstance) {
      return preferredInstance.id;
    }
  }

  return matchingInstances.find((instance) => instance.isPrimary)?.id ?? matchingInstances[0]?.id ?? null;
};

const activeCommentInstanceId = computed(() => {
  if (!activeComment.value) return null;
  return resolveFloatingInstanceId(activeComment.value, activeFloatingCommentInstanceId.value);
});

// Heights: measured (actual) or estimated. Seeded from module-level cache to
// survive remounts triggered by hasInitializedLocations toggle in SuperDoc.vue.
const measuredHeights = ref({ ..._heightsCache });

// Set of comment IDs that are near the viewport (should mount CommentDialog)
const visibleIds = ref(new Set());

// Refs for placeholder elements keyed by comment ID
const placeholderRefs = ref({});

let observer = null;
// Track which DOM elements are currently being observed (avoids disconnect/re-observe cycle)
const observedElements = new Set();

// Compute anchor position for a floating comment instance.
const getAnchorTop = (instance) => {
  if (props.currentDocument.type === 'application/pdf') {
    const zoom = (activeZoom.value ?? 100) / 100;
    return Number(instance?.comment?.selection?.selectionBounds?.top) * zoom;
  }

  return instance?.positionEntry?.bounds?.top;
};

// Compute anchor position for the pending (new) comment.
// For editor docs, uses the 'pending' mark position from editorCommentPositions.
// For PDF docs, falls back to selection bounds (same as getAnchorTop).
const getPendingAnchorTop = () => {
  const positionEntry = editorCommentPositions.value['pending'];
  if (typeof positionEntry?.bounds?.top === 'number' && !isNaN(positionEntry.bounds.top)) {
    return positionEntry.bounds.top;
  }

  const zoom = props.currentDocument.type === 'application/pdf' ? (activeZoom.value ?? 100) / 100 : 1;
  const top = Number(pendingComment.value?.selection?.selectionBounds?.top);
  return isNaN(top) ? null : top * zoom;
};

const instantAlignmentInstanceKey = computed(() => {
  if (!instantSidebarAlignmentThreadId.value) {
    return null;
  }

  return resolveFloatingInstanceId(instantSidebarAlignmentThreadId.value, instantSidebarAlignmentInstanceId.value);
});

// Pre-compute all positions with collision avoidance
const allPositions = computed(() => {
  const instances = floatingCommentInstances.value;
  const hasPending = pendingComment.value && pendingComment.value.fileId === props.currentDocument.id;
  if (!instances.length && !hasPending) return [];

  const positions = [];
  for (const instance of instances) {
    const key = instance?.id;
    const top = getAnchorTop(instance);
    const threadId = getThreadId(instance?.comment);
    if (!key || !threadId || typeof top !== 'number' || isNaN(top)) continue;

    positions.push({
      id: key,
      threadId,
      pageIndex: instance?.pageIndex ?? null,
      anchorTop: top,
      top,
      height: measuredHeights.value[key] || ESTIMATED_HEIGHT,
      commentRef: instance.comment,
      instanceRef: instance,
    });
  }

  // Include pending (new) comment in the layout
  if (hasPending) {
    const pendingTop = getPendingAnchorTop();
    if (typeof pendingTop === 'number' && !isNaN(pendingTop)) {
      positions.push({
        id: 'pending',
        anchorTop: pendingTop,
        top: pendingTop,
        height: measuredHeights.value['pending'] || ESTIMATED_HEIGHT,
        commentRef: pendingComment.value,
      });
    }
  }

  positions.sort((a, b) => a.anchorTop - b.anchorTop);

  // Pending comment is always treated as active for collision avoidance
  const activeKey = hasPending ? 'pending' : activeCommentInstanceId.value;
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

// The inner sidebar is translated by sidebarOffsetY. When shifted down, the
// rendered bottom edge can exceed totalHeight and get clipped by parent scroll
// containers. Expand wrapper height to include positive translate offset.
const wrapperMinHeight = computed(() => {
  return totalHeight.value + Math.max(0, sidebarOffsetY.value);
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

// Observe/unobserve placeholder elements when positions change.
// Uses differential observation to avoid disconnect() which cancels pending callbacks
// and causes a gap where visibleIds is stale (comments flash in/out).
const observePlaceholders = () => {
  if (!observer) return;

  const currentElements = new Set();
  for (const pos of allPositions.value) {
    const el = placeholderRefs.value[pos.id];
    if (!el) continue;
    currentElements.add(el);
    if (!observedElements.has(el)) {
      observer.observe(el);
      observedElements.add(el);
    }
  }

  // Unobserve elements that are no longer in allPositions
  for (const el of observedElements) {
    if (!currentElements.has(el)) {
      observer.unobserve(el);
      observedElements.delete(el);
    }
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
  const { elementRef, commentId: instanceId } = dialog;
  if (!elementRef) return;

  nextTick(() => {
    const bounds = elementRef.value?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    if (instanceId) storeHeight(instanceId, bounds.height);
  });
};

// Re-measure a specific comment dialog when it signals a resize (e.g. text truncation toggle)
const handleResize = (position) => {
  const key = position?.id;
  if (!key) return;
  nextTick(() => {
    const el = placeholderRefs.value[key];
    if (!el) return;
    const dialog = el.querySelector('.comments-dialog');
    if (!dialog) return;
    storeHeight(key, dialog.getBoundingClientRect().height);

    const isActiveInstance = key === activeCommentInstanceId.value;
    const isPending = key === 'pending';
    const isEditingThread =
      !!editingCommentId.value &&
      !!activeComment.value &&
      position?.threadId != null &&
      String(position.threadId) === String(activeComment.value);
    if (!isActiveInstance && !isPending && !isEditingThread) return;

    // Reflow nearby cards after size changes of the active/pending/editing thread.
    // Avoid force-snapping to anchor here because it can over-shift the whole lane
    // near viewport boundaries and make bottom clipping more frequent.
    remeasureCommentKeys(allPositions.value.map((pos) => pos.id));
    scheduleDeferredRemeasure(() => allPositions.value.map((pos) => pos.id));
  });
};

const setInstantLayoutTransitionsDisabled = (disabled) => {
  disableInstantLayoutTransitions.value = disabled;
};

const alignCommentKeyToClientY = (key, targetY, onComplete) => {
  if (!Number.isFinite(targetY)) {
    onComplete?.(false);
    return;
  }
  const el = placeholderRefs.value[key];
  if (!el) {
    onComplete?.(false);
    return;
  }

  const currentTop = el.getBoundingClientRect().top;
  sidebarOffsetY.value += targetY - currentTop;
  onComplete?.(true);
};

// Store placeholder ref by comment ID
const setPlaceholderRef = (id, el) => {
  if (el) {
    placeholderRefs.value[id] = el;
    if (observer && !observedElements.has(el)) {
      observer.observe(el);
      observedElements.add(el);
    }
  } else {
    const prev = placeholderRefs.value[id];
    if (prev && observer) {
      observer.unobserve(prev);
      observedElements.delete(prev);
    }
    delete placeholderRefs.value[id];
  }
};

// Timer IDs for cancellation on rapid active-comment switching
let remeasureTimers = [];
let scrollTimer = null;

const clearDeferredRemeasureTimers = () => {
  remeasureTimers.forEach(clearTimeout);
  remeasureTimers = [];
};

const remeasureCommentKeys = (keys) => {
  for (const key of keys.filter(Boolean)) {
    const el = placeholderRefs.value[key];
    if (!el) continue;
    const dialog = el.querySelector('.comments-dialog');
    if (!dialog) continue;
    storeHeight(key, dialog.getBoundingClientRect().height);
  }
};

// 50ms: after Vue nextTick + browser rAF settle the initial DOM change.
// 350ms: after .comment-placeholder transition (300ms ease) completes.
const REMEASURE_AFTER_DOM_SETTLE_MS = 50;
const REMEASURE_AFTER_PLACEHOLDER_TRANSITION_MS = 350;

/**
 * Cancels any pending delayed remeasure passes, then schedules two remeasure runs.
 * Pass an array of keys, or a getter so keys are resolved when each timeout fires
 * (e.g. when `allPositions` may have changed).
 */
const scheduleDeferredRemeasure = (keysOrGetter) => {
  clearDeferredRemeasureTimers();
  const resolveKeys = typeof keysOrGetter === 'function' ? keysOrGetter : () => keysOrGetter;
  remeasureTimers.push(setTimeout(() => remeasureCommentKeys(resolveKeys()), REMEASURE_AFTER_DOM_SETTLE_MS));
  remeasureTimers.push(
    setTimeout(() => remeasureCommentKeys(resolveKeys()), REMEASURE_AFTER_PLACEHOLDER_TRANSITION_MS),
  );
};

const finishInstantSidebarAlignment = () => {
  clearInstantSidebarAlignment();
  requestAnimationFrame(() => {
    setInstantLayoutTransitionsDisabled(false);
  });
};

const applyInstantSidebarAlignment = (key, targetY) => {
  if (!key || !Number.isFinite(targetY)) return;

  setInstantLayoutTransitionsDisabled(true);
  nextTick(() => {
    remeasureCommentKeys([key]);
    alignCommentKeyToClientY(key, targetY, () => {
      finishInstantSidebarAlignment();
    });
  });
};

// Re-measure when active comment changes. The active dialog expands (reply input, thread)
// and the previously active one collapses — both change height.
watch(activeCommentInstanceId, (newKey, oldKey) => {
  clearDeferredRemeasureTimers();
  const keysToRemeasure = [newKey, oldKey];
  const hasPendingInstantAlignment =
    newKey && newKey === instantAlignmentInstanceKey.value && Number.isFinite(instantSidebarAlignmentTargetY.value);

  nextTick(() => {
    if (hasPendingInstantAlignment) {
      remeasureCommentKeys(keysToRemeasure);
      return;
    }

    scheduleDeferredRemeasure(keysToRemeasure);
  });
});

watch(
  [activeCommentInstanceId, instantAlignmentInstanceKey, instantSidebarAlignmentTargetY],
  ([activeKey, requestKey, targetY]) => {
    if (!activeKey || !requestKey || activeKey !== requestKey || !Number.isFinite(targetY)) return;
    applyInstantSidebarAlignment(activeKey, targetY);
  },
);

// Re-measure when editing state changes. Entering/exiting edit mode changes
// the dialog height (CommentInput + action buttons vs static text).
// We remeasure all visible dialogs because the editing comment's parent dialog
// might not be the activeComment (e.g., dropdown interaction deactivated it).
watch(editingCommentId, () => {
  clearDeferredRemeasureTimers();

  nextTick(() => {
    scheduleDeferredRemeasure(() => allPositions.value.map((pos) => pos.id));
  });
});

// Align the active comment bubble with the same on-screen Y position as its
// document anchor by translating the inner sidebar layer.
watch(activeComment, () => {
  if (scrollTimer) clearTimeout(scrollTimer);

  if (!activeComment.value) {
    clearInstantSidebarAlignment();
    setInstantLayoutTransitionsDisabled(false);
    sidebarOffsetY.value = 0;
    return;
  }
  const comment = isPendingThread(activeComment.value)
    ? pendingComment.value
    : commentsStore.getComment(activeComment.value);
  if (!comment) return;
  const key = isPendingThread(activeComment.value) ? 'pending' : activeCommentInstanceId.value;
  if (!key) return;
  const instantAlignment =
    key === instantAlignmentInstanceKey.value && Number.isFinite(instantSidebarAlignmentTargetY.value);
  if (instantAlignment) {
    setInstantLayoutTransitionsDisabled(true);
    return;
  }

  nextTick(() => {
    const applyAlignment = () => {
      const el = placeholderRefs.value[key];
      if (!el) return;
      const parentRect = props.parent?.getBoundingClientRect?.();
      if (!parentRect) return;

      const activePosition = allPositions.value.find((position) => position.id === key);
      const anchorTop = key === 'pending' ? getPendingAnchorTop() : activePosition?.anchorTop;
      if (typeof anchorTop !== 'number' || isNaN(anchorTop)) return;

      const currentTop = el.getBoundingClientRect().top;
      const desiredTop = parentRect.top + anchorTop;
      sidebarOffsetY.value += desiredTop - currentTop;
    };

    // 400ms: wait for .comment-placeholder CSS transition (300ms) + buffer
    scrollTimer = setTimeout(applyAlignment, 400);
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

// Track positioned IDs so we can detect additions/removals
let prevPositionIds = new Set();

// Re-observe when positions change; clean up stale heights and remeasure on add/remove
watch(allPositions, (positions) => {
  const currentIds = new Set(positions.map((p) => p.id));

  // Eagerly add new IDs near the viewport so they render immediately.
  // The IntersectionObserver will asynchronously confirm/prune them.
  // Without this, comments flash blank on initial load because the observer
  // callback hasn't fired yet. We scope to nearby IDs to avoid mounting
  // every dialog at once on documents with 100+ comments.
  const newVisible = new Set(visibleIds.value);
  let visibilityChanged = false;

  let nearbyTop = -Infinity;
  let nearbyBottom = Infinity;
  const container = floatingCommentsContainer.value;
  if (container) {
    const rect = container.getBoundingClientRect();
    nearbyTop = -rect.top - OBSERVER_MARGIN;
    nearbyBottom = -rect.top + window.innerHeight + OBSERVER_MARGIN;
  }

  const positionById = new Map(positions.map((p) => [p.id, p]));
  for (const id of currentIds) {
    if (!newVisible.has(id)) {
      const pos = positionById.get(id);
      if (!pos || (pos.top >= nearbyTop && pos.top <= nearbyBottom)) {
        newVisible.add(id);
        visibilityChanged = true;
      }
    }
  }
  // Remove IDs no longer in allPositions
  for (const id of newVisible) {
    if (!currentIds.has(id)) {
      newVisible.delete(id);
      visibilityChanged = true;
    }
  }
  if (visibilityChanged) {
    visibleIds.value = newVisible;
  }

  // Clean up cached heights for removed comments
  for (const id of prevPositionIds) {
    if (!currentIds.has(id)) {
      delete _heightsCache[id];
    }
  }

  // If the set of IDs changed (comment added, deleted, or resolved), remeasure
  // remaining comments — their heights may have changed (e.g. parent card after
  // a child reply was deleted becomes shorter).
  const setChanged = prevPositionIds.size !== currentIds.size || [...prevPositionIds].some((id) => !currentIds.has(id));
  if (setChanged) {
    // Remove stale heights so allPositions recomputes with ESTIMATED_HEIGHT
    // for the next cycle, then measure actual heights after DOM settles.
    const cleaned = {};
    for (const id of currentIds) {
      if (_heightsCache[id]) cleaned[id] = _heightsCache[id];
    }
    measuredHeights.value = cleaned;

    nextTick(() => {
      for (const pos of positions) {
        const el = placeholderRefs.value[pos.id];
        if (!el) continue;
        const dialog = el.querySelector('.comments-dialog');
        if (!dialog) continue;
        storeHeight(pos.id, dialog.getBoundingClientRect().height);
      }
    });
  }

  prevPositionIds = currentIds;
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
    observedElements.clear();
  }
  // NOTE: Do NOT clear _heightsCache here. The module-level cache is designed to
  // survive remounts caused by hasInitializedLocations toggle in SuperDoc.vue.
  // Clearing it causes flickering because every remount starts with estimated heights.
});
</script>

<template>
  <div
    class="section-wrapper"
    ref="floatingCommentsContainer"
    :style="{
      minHeight: wrapperMinHeight + 'px',
      transition: disableInstantLayoutTransitions ? 'none' : undefined,
    }"
  >
    <div
      class="sidebar-container"
      :style="{
        transform: `translateY(${sidebarOffsetY}px)`,
        transition: disableInstantLayoutTransitions ? 'none' : undefined,
      }"
    >
      <!-- Lightweight placeholders for ALL comments (observed for viewport proximity) -->
      <div
        v-for="pos in allPositions"
        :key="pos.id"
        :ref="(el) => setPlaceholderRef(pos.id, el)"
        :data-comment-id="pos.id"
        :data-comment-instance-id="pos.id"
        :data-comment-thread-id="pos.threadId"
        :data-comment-position-key="pos.instanceRef?.positionKey ?? ''"
        :data-comment-page-index="pos.pageIndex ?? ''"
        :style="{
          top: pos.top + 'px',
          height: pos.height + 'px',
          transition: disableInstantLayoutTransitions ? 'none' : undefined,
        }"
        class="comment-placeholder"
      >
        <!-- Only mount the heavy CommentDialog when near the viewport -->
        <CommentDialog
          v-if="visibleIds.has(pos.id) || pos.id === activeCommentInstanceId || pos.id === 'pending'"
          :key="pos.id + commentsRenderKey"
          @ready="handleDialog"
          @resize="handleResize(pos)"
          class="floating-comment"
          :parent="parent"
          :comment="pos.commentRef"
          :floating-instance-id="pos.id"
          :floating-page-index="pos.pageIndex"
          :floating-position-entry="pos.instanceRef?.positionEntry ?? null"
          :is-floating-instance-active="pos.id === activeCommentInstanceId"
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
  transition: transform 0.3s ease;
  will-change: transform;
}

.section-wrapper {
  position: relative;
  min-height: 100%;
  width: 300px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  /* SD-2034: smooth min-height changes to prevent scrollbar flash */
  transition: min-height 0.5s ease-out;
}
</style>
