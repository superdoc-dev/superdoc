<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import { createSuperDocUI, type SuperDocUI, type CommentsSlice } from 'superdoc/ui';
import 'superdoc/style.css';
import CommentCard from './CommentCard.vue';

const CURRENT_USER = { name: 'Demo User', email: 'demo@example.com' };

interface LayoutChangePayload {
  containerWidth: number;
  documentWidth: number;
  fitZoom: number;
}

const editorContainer = ref<HTMLDivElement>();
const sidebarWidth = ref(320);
const isDragging = ref(false);
const superdoc = shallowRef<SuperDoc | null>(null);
const ui = shallowRef<SuperDocUI | null>(null);
const commentsSnapshot = ref<CommentsSlice>({ total: 0, items: [], activeIds: [] });

let dragStartX = 0;
let dragStartWidth = 0;

// Initialize SuperDoc and UI
onMounted(() => {
  if (!editorContainer.value) return;

  const sd = new SuperDoc({
    selector: editorContainer.value,
    document: '/sample-review.docx',
    documentMode: 'editing',
    user: CURRENT_USER,
    modules: { comments: false },
    telemetry: { enabled: false },
    contained: true,
  });

  superdoc.value = sd;

  // Subscribe to layout-change event for auto-zoom
  sd.on('layout-change', (payload: LayoutChangePayload) => {
    const clampedZoom = Math.max(50, Math.min(150, payload.fitZoom));
    sd.setZoom(clampedZoom);
  });

  // Create UI controller and subscribe to comments
  const uiController = createSuperDocUI({ superdoc: sd });
  ui.value = uiController;

  uiController.comments.observe((snapshot) => {
    commentsSnapshot.value = snapshot;
  });
});

onUnmounted(() => {
  ui.value?.destroy();
  superdoc.value?.destroy();
});

// Handle mouse down on resize handle
function handleMouseDown(e: MouseEvent) {
  e.preventDefault();
  isDragging.value = true;
  dragStartX = e.clientX;
  dragStartWidth = sidebarWidth.value;
}

// Handle mouse move during drag
function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  const delta = dragStartX - e.clientX;
  const maxWidth = window.innerWidth * 0.7;
  sidebarWidth.value = Math.max(200, Math.min(maxWidth, dragStartWidth + delta));
}

function handleMouseUp() {
  isDragging.value = false;
}

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

function handleResolveComment(id: string) {
  ui.value?.comments.resolve(id);
}

function handleReopenComment(id: string) {
  ui.value?.comments.reopen(id);
}

function handleReplyComment(id: string, text: string) {
  ui.value?.comments.reply(id, { text });
}

function handleScrollToComment(id: string) {
  ui.value?.comments.scrollTo(id);
}

// Separate comments into active/resolved and group replies
const processedComments = computed(() => {
  const items = commentsSnapshot.value.items;
  const commentRoots = new Set<string>();
  const replyMap = new Map<string, typeof items>();

  for (const item of items) {
    if (!item.parentCommentId) {
      commentRoots.add(item.id);
    } else {
      const list = replyMap.get(item.parentCommentId) ?? [];
      list.push(item);
      replyMap.set(item.parentCommentId, list);
    }
  }

  const active: typeof items = [];
  const resolved: typeof items = [];

  for (const item of items) {
    if (item.parentCommentId && commentRoots.has(item.parentCommentId)) continue;

    if (item.status === 'resolved') {
      resolved.push(item);
    } else {
      active.push(item);
    }
  }

  return { active, resolved, repliesByParent: replyMap, activeIds: commentsSnapshot.value.activeIds };
});

const isEmpty = computed(() => {
  return processedComments.value.active.length === 0 &&
         processedComments.value.resolved.length === 0;
});
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>Layout Change Event Demo</h1>
      <span class="subtitle">Drag the sidebar edge to resize</span>
    </header>

    <div class="app-body">
      <section class="editor-area">
        <div ref="editorContainer" class="editor-canvas" />
      </section>

      <div
        :class="['resize-handle', { dragging: isDragging }]"
        @mousedown="handleMouseDown"
      >
        <div class="resize-handle-line" />
      </div>

      <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-header">Comments</div>
        <div class="sidebar-panel">
          <div class="activity">
            <!-- Empty state -->
            <div v-if="isEmpty" class="empty-state">
              No comments yet. Select text and click "+ Comment" to add one.
            </div>

            <!-- Active comments -->
            <template v-if="processedComments.active.length > 0">
              <div class="activity-section-label">Active · {{ processedComments.active.length }}</div>
              <CommentCard
                v-for="comment in processedComments.active"
                :key="comment.id"
                :comment="comment"
                :resolved="false"
                :replies="processedComments.repliesByParent.get(comment.id)"
                :active="processedComments.activeIds.includes(comment.id)"
                @resolve="handleResolveComment(comment.id)"
                @reopen="handleReopenComment(comment.id)"
                @reply="(text: string) => handleReplyComment(comment.id, text)"
                @click="handleScrollToComment(comment.id)"
              />
            </template>

            <!-- Resolved comments -->
            <template v-if="processedComments.resolved.length > 0">
              <div class="activity-section-label muted">Resolved · {{ processedComments.resolved.length }}</div>
              <CommentCard
                v-for="comment in processedComments.resolved"
                :key="comment.id"
                :comment="comment"
                :resolved="true"
                :replies="processedComments.repliesByParent.get(comment.id)"
                :active="false"
                @resolve="handleResolveComment(comment.id)"
                @reopen="handleReopenComment(comment.id)"
                @reply="(text: string) => handleReplyComment(comment.id, text)"
                @click="handleScrollToComment(comment.id)"
              />
            </template>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
