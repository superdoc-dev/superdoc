<script setup>
/**
 * Headless Comments Panel - Paired Track Changes & Comments
 *
 * Shows track changes paired with comments anchored on them in a two-column layout.
 * Track change on left, associated comment(s) on right.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  isReady: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);

// Comments data
const comments = ref([]);
const isLoading = ref(true);
const error = ref(null);

// Get editor/superdoc instances
const getEditor = () => window.editor;
const getSuperdoc = () => window.superdoc;

// Fetch comments using Document API
const fetchComments = () => {
  const editor = getEditor();
  if (!editor?.doc?.comments) {
    if (props.isReady) {
      error.value = 'Editor not ready';
    }
    isLoading.value = false;
    return;
  }

  try {
    const result = editor.doc.comments.list({ includeResolved: true });
    comments.value = result?.items ?? [];
    // Debug: log the first few comments to see their structure
    if (comments.value.length > 0) {
      console.log('=== Comment objects structure ===');
      comments.value.slice(0, 3).forEach((c, i) => {
        console.log(`Comment ${i}:`, JSON.stringify(c, null, 2));
      });
    }
    error.value = null;
  } catch (e) {
    console.error('Failed to fetch comments:', e);
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
};

// Build paired rows from the unified data
// Each item can be:
// - A track change with a comment (trackedChange: true AND has text)
// - A track change without a comment (trackedChange: true, no text)
// - A standalone comment (trackedChange: false/undefined)
const pairedRows = computed(() => {
  const rows = [];

  for (const item of comments.value) {
    const isTrackChange = item.trackedChange === true;
    const hasComment = item.text && item.text.trim().length > 0;
    const changeText = item.deletedText || item.trackedChangeText || item.insertedText || '';

    if (isTrackChange) {
      // Track change - may also have a comment
      rows.push({
        type: hasComment ? 'paired' : 'change-only',
        change: {
          ...item,
          displayText: changeText || item.anchoredText || '',
        },
        commentText: hasComment ? item.text : null,
        commentItem: hasComment ? item : null,
        resolved: item.status === 'resolved',
      });
    } else {
      // Standalone comment (not on a track change)
      rows.push({
        type: 'comment-only',
        change: null,
        commentText: item.text || '',
        commentItem: item,
        resolved: item.status === 'resolved',
      });
    }
  }

  return rows;
});

// Active and resolved rows
const activeRows = computed(() => pairedRows.value.filter((r) => !r.resolved));
const resolvedRows = computed(() => pairedRows.value.filter((r) => r.resolved));

// Stats
const stats = computed(() => {
  const active = activeRows.value;
  return {
    trackChanges: active.filter((r) => r.change).length,
    comments: active.filter((r) => r.commentText).length,
    resolved: resolvedRows.value.length,
  };
});

// Comment actions using Document API
const resolveComment = (commentId) => {
  const editor = getEditor();
  if (!editor?.doc?.comments) return;
  try {
    editor.doc.comments.update({ id: commentId, status: 'resolved' });
    fetchComments();
  } catch (e) {
    console.error('Failed to resolve comment:', e);
  }
};

const reopenComment = (commentId) => {
  const editor = getEditor();
  if (!editor?.doc?.comments) return;
  try {
    editor.doc.comments.update({ id: commentId, status: 'active' });
    fetchComments();
  } catch (e) {
    console.error('Failed to reopen comment:', e);
  }
};

const deleteComment = (commentId) => {
  const editor = getEditor();
  if (!editor?.doc?.comments) return;
  try {
    editor.doc.comments.delete({ id: commentId });
    fetchComments();
  } catch (e) {
    console.error('Failed to delete comment:', e);
  }
};

// Track change actions
const acceptChange = (change) => {
  const editor = getEditor();
  if (!editor?.doc?.trackChanges) return;
  try {
    const changeId = change.trackedChangeAnchorKey || change.id || change.commentId;
    editor.doc.trackChanges.decide({ decision: 'accept', target: { id: changeId } });
    fetchComments();
  } catch (e) {
    console.error('Failed to accept change:', e);
  }
};

const rejectChange = (change) => {
  const editor = getEditor();
  if (!editor?.doc?.trackChanges) return;
  try {
    const changeId = change.trackedChangeAnchorKey || change.id || change.commentId;
    editor.doc.trackChanges.decide({ decision: 'reject', target: { id: changeId } });
    fetchComments();
  } catch (e) {
    console.error('Failed to reject change:', e);
  }
};

// Bulk actions
const acceptAllChanges = () => {
  activeRows.value
    .filter((r) => r.change)
    .forEach((row) => acceptChange(row.change));
};

const rejectAllChanges = () => {
  activeRows.value
    .filter((r) => r.change)
    .forEach((row) => rejectChange(row.change));
};

// Navigate to item in document
const goToItem = async (item) => {
  const superdoc = getSuperdoc();
  if (!superdoc?.scrollToElement) return;

  const idsToTry = [
    item.id,
    item.commentId,
    item.trackedChangeAnchorKey,
    item.address?.commentId,
  ].filter(Boolean);

  for (const elementId of idsToTry) {
    try {
      const result = await superdoc.scrollToElement(elementId);
      if (result) return;
    } catch (e) {
      // Try next ID
    }
  }
};

// Format date
const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Get change type label and class
const getChangeType = (change) => {
  const type = change.trackedChangeType || change.trackedChangeDisplayType;
  if (type === 'insert') return { label: 'Inserted', class: 'insert' };
  if (type === 'delete') return { label: 'Deleted', class: 'delete' };
  if (type === 'format') return { label: 'Formatted', class: 'format' };
  return { label: 'Changed', class: 'change' };
};

// Get display text for track change
const getChangeText = (change) => {
  const text = change.trackedChangeText || change.deletedText || change.anchoredText ||
               change.insertedText || change.text || '';
  return text || '[Keys: ' + Object.keys(change).slice(0, 10).join(', ') + ']';
};

// Get comment text - try various field names
const getCommentText = (comment) => {
  return comment.text || comment.content || comment.body || comment.message ||
         (comment.replies && comment.replies[0]?.text) ||
         (comment.replies && comment.replies[0]?.content) ||
         '[No text - keys: ' + Object.keys(comment).join(', ') + ']';
};

// Polling
let refreshInterval = null;

const startPolling = () => {
  if (refreshInterval) return;
  fetchComments();
  refreshInterval = setInterval(fetchComments, 2000);
};

const stopPolling = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

// Watch for editor readiness
watch(
  () => props.isReady,
  (ready) => {
    if (ready) {
      isLoading.value = true;
      setTimeout(() => {
        fetchComments();
        startPolling();
      }, 300);
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (props.isReady) {
    startPolling();
  }
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div class="comments-panel">
    <div class="panel-header">
      <h2>Review Panel</h2>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>

    <!-- Stats & bulk actions -->
    <div class="toolbar-bar">
      <div class="stats">
        <span class="stat"><strong>{{ stats.trackChanges }}</strong> changes</span>
        <span class="stat-sep">·</span>
        <span class="stat"><strong>{{ stats.comments }}</strong> comments</span>
      </div>
      <div v-if="stats.trackChanges > 0" class="bulk-actions">
        <button class="bulk-btn accept" @click="acceptAllChanges">Accept All</button>
        <button class="bulk-btn reject" @click="rejectAllChanges">Reject All</button>
      </div>
    </div>

    <!-- Column headers -->
    <div class="column-headers">
      <div class="col-header col-left">Track Changes</div>
      <div class="col-header col-right">Comments</div>
    </div>

    <!-- Loading/Error states -->
    <div v-if="isLoading" class="state-message">Loading...</div>
    <div v-else-if="error" class="state-message error">{{ error }}</div>
    <div v-else-if="!isReady" class="state-message">Waiting for editor...</div>

    <!-- Paired rows -->
    <div v-else class="rows-container">
      <div v-if="activeRows.length === 0" class="empty-state">
        No changes or comments found.
      </div>

      <div
        v-for="(row, idx) in activeRows"
        :key="idx"
        class="paired-row"
        :class="{ 'comment-only': row.type === 'comment-only' }"
      >
        <!-- Left: Track Change -->
        <div class="col-left">
          <div
            v-if="row.change"
            class="change-card"
            :class="getChangeType(row.change).class"
            @click="goToItem(row.change)"
          >
            <div class="change-header">
              <span class="change-badge" :class="getChangeType(row.change).class">
                {{ getChangeType(row.change).label }}
              </span>
              <span class="change-author">{{ row.change.creatorName || 'Unknown' }}</span>
            </div>
            <div class="change-text">{{ row.change.displayText }}</div>
            <div class="change-actions">
              <button class="action-btn accept" @click.stop="acceptChange(row.change)">
                Accept
              </button>
              <button class="action-btn reject" @click.stop="rejectChange(row.change)">
                Reject
              </button>
            </div>
          </div>
          <div v-else class="empty-cell"></div>
        </div>

        <!-- Right: Comment -->
        <div class="col-right">
          <div
            v-if="row.commentText"
            class="comment-card"
            @click="goToItem(row.commentItem)"
          >
            <div class="comment-header">
              <span class="comment-avatar">{{ (row.commentItem?.creatorName || 'U')[0] }}</span>
              <span class="comment-author">{{ row.commentItem?.creatorName || 'Unknown' }}</span>
              <span class="comment-date">{{ formatDate(row.commentItem?.createdTime) }}</span>
            </div>
            <div class="comment-text">{{ row.commentText }}</div>
            <div class="comment-actions">
              <button
                class="action-btn"
                @click.stop="resolveComment(row.commentItem?.id || row.commentItem?.commentId)"
              >
                Resolve
              </button>
              <button
                class="action-btn delete"
                @click.stop="deleteComment(row.commentItem?.id || row.commentItem?.commentId)"
              >
                Delete
              </button>
            </div>
          </div>
          <div v-else class="empty-cell">
            <span class="no-comment">No comment</span>
          </div>
        </div>
      </div>

      <!-- Resolved Section -->
      <div v-if="resolvedRows.length > 0" class="resolved-section">
        <details>
          <summary class="resolved-toggle">
            Resolved ({{ resolvedRows.length }})
          </summary>
          <div class="resolved-list">
            <div
              v-for="(row, idx) in resolvedRows"
              :key="'resolved-' + idx"
              class="resolved-row"
            >
              <div class="resolved-item" v-if="row.change">
                <span class="resolved-badge">{{ getChangeType(row.change).label }}</span>
                <span class="resolved-text">{{ row.change.displayText }}</span>
                <button
                  class="action-btn small"
                  @click="reopenComment(row.change.id || row.change.commentId)"
                >
                  Reopen
                </button>
              </div>
              <div v-if="row.commentText" class="resolved-item">
                <span class="resolved-badge comment">Comment</span>
                <span class="resolved-text">{{ row.commentText }}</span>
                <button
                  class="action-btn small"
                  @click="reopenComment(row.commentItem?.id || row.commentItem?.commentId)"
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comments-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
  color: #1e293b;
  background: #f8fafc;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.panel-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #1e293b;
}

.toolbar-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.stats strong {
  color: #334155;
}

.stat-sep {
  color: #cbd5e1;
}

.debug-section {
  padding: 8px 16px;
  background: #fef3c7;
  border-bottom: 1px solid #fbbf24;
  font-size: 11px;
}

.debug-section summary {
  cursor: pointer;
  color: #92400e;
  font-weight: 500;
}

.debug-pre {
  margin-top: 8px;
  padding: 8px;
  background: #fff;
  border-radius: 4px;
  overflow-x: auto;
  max-height: 200px;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}

.bulk-actions {
  display: flex;
  gap: 6px;
}

.bulk-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.bulk-btn.accept {
  background: #dcfce7;
  color: #166534;
}

.bulk-btn.accept:hover {
  background: #bbf7d0;
}

.bulk-btn.reject {
  background: #fee2e2;
  color: #991b1b;
}

.bulk-btn.reject:hover {
  background: #fecaca;
}

.column-headers {
  display: flex;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.col-header {
  flex: 1;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
}

.col-header.col-left {
  border-right: 1px solid #e2e8f0;
}

.state-message {
  padding: 32px;
  text-align: center;
  color: #64748b;
}

.state-message.error {
  color: #dc2626;
}

.rows-container {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  padding: 32px 24px;
  text-align: center;
  color: #94a3b8;
  margin: 16px;
  background: #fff;
  border-radius: 8px;
  border: 1px dashed #e2e8f0;
}

/* Paired Row */
.paired-row {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}

.paired-row:hover {
  background: #fafbfc;
}

.col-left,
.col-right {
  flex: 1;
  padding: 10px;
  min-height: 80px;
}

.col-left {
  border-right: 1px solid #f1f5f9;
  background: #fefefe;
}

.col-right {
  background: #fff;
}

.empty-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 60px;
}

.no-comment {
  font-size: 11px;
  color: #cbd5e1;
  font-style: italic;
}

/* Change Card */
.change-card {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 3px solid transparent;
}

.change-card:hover {
  background: #f8fafc;
}

.change-card.delete {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.change-card.insert {
  border-left-color: #22c55e;
  background: #f0fdf4;
}

.change-card.format {
  border-left-color: #8b5cf6;
  background: #faf5ff;
}

.change-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.change-badge {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 5px;
  border-radius: 3px;
  letter-spacing: 0.3px;
}

.change-badge.delete {
  background: #fee2e2;
  color: #991b1b;
}

.change-badge.insert {
  background: #dcfce7;
  color: #166534;
}

.change-badge.format {
  background: #ede9fe;
  color: #5b21b6;
}

.change-author {
  font-size: 11px;
  font-weight: 500;
  color: #475569;
}

.change-text {
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
  margin-bottom: 8px;
  word-break: break-word;
}

.change-actions {
  display: flex;
  gap: 4px;
}

/* Comment Card */
.comment-card {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid #e2e8f0;
  background: #fff;
  margin-bottom: 6px;
}

.comment-card:last-child {
  margin-bottom: 0;
}

.comment-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.comment-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.comment-author {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.comment-date {
  font-size: 10px;
  color: #94a3b8;
  margin-left: auto;
}

.comment-text {
  font-size: 12px;
  color: #334155;
  line-height: 1.4;
  margin-bottom: 8px;
}

.comment-actions {
  display: flex;
  gap: 4px;
}

/* Action Buttons */
.action-btn {
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 500;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: #f1f5f9;
}

.action-btn.accept {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}

.action-btn.accept:hover {
  background: #bbf7d0;
}

.action-btn.reject,
.action-btn.delete {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.action-btn.reject:hover,
.action-btn.delete:hover {
  background: #fecaca;
}

.action-btn.small {
  padding: 2px 8px;
  font-size: 9px;
}

/* Resolved Section */
.resolved-section {
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.resolved-toggle {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  list-style: none;
}

.resolved-toggle::-webkit-details-marker {
  display: none;
}

.resolved-toggle::before {
  content: '▸ ';
}

details[open] .resolved-toggle::before {
  content: '▾ ';
}

.resolved-list {
  padding: 0 12px 12px;
}

.resolved-row {
  margin-bottom: 8px;
}

.resolved-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f8fafc;
  border-radius: 4px;
  margin-bottom: 4px;
}

.resolved-item:last-child {
  margin-bottom: 0;
}

.resolved-badge {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 5px;
  border-radius: 3px;
  background: #e2e8f0;
  color: #64748b;
  flex-shrink: 0;
}

.resolved-badge.comment {
  background: #dbeafe;
  color: #1e40af;
}

.resolved-text {
  font-size: 11px;
  color: #64748b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Comment-only rows */
.paired-row.comment-only .col-left {
  background: #f8fafc;
}
</style>
