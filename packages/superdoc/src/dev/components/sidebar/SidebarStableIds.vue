<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';

const emit = defineEmits(['close']);

const events = ref([]);
const EVENT_LIMIT = 15;
let previousBlockIds = new Map(); // id -> { nodeType, textPreview, pos }
let unsubscribe = null;

/**
 * Extract stable ID from a PM node's attributes.
 * Priority: paraId (OOXML) > sdBlockId (SuperDoc generated)
 */
const getStableId = (node) => {
  const attrs = node?.attrs;
  if (!attrs) return null;
  // paraId is OOXML-sourced (8-char hex), sdBlockId is SuperDoc-generated
  return attrs.paraId ?? attrs.sdBlockId ?? null;
};

/**
 * Classify the ID type for display
 */
const getIdType = (node) => {
  const attrs = node?.attrs;
  if (!attrs) return 'none';
  if (attrs.paraId) return 'paraId';
  if (attrs.sdBlockId) {
    // Check if it's UUID-like (session-scoped) or deterministic
    const id = String(attrs.sdBlockId);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return 'sdBlockId (UUID)';
    }
    return 'sdBlockId';
  }
  return 'none';
};

/**
 * Get a short text preview from a node
 */
const getTextPreview = (node) => {
  if (!node) return '';
  const text = node.textContent ?? '';
  if (text.length <= 20) return text;
  return text.slice(0, 20) + '...';
};

/**
 * Collect all block-level nodes with their IDs from a PM document
 */
const collectBlockIds = (doc) => {
  const blocks = new Map();
  if (!doc) return blocks;

  doc.descendants((node, pos) => {
    const nodeType = node.type?.name;
    // Only track block-level nodes that typically have stable IDs
    if (!['paragraph', 'heading', 'listItem', 'table', 'tableRow', 'tableCell'].includes(nodeType)) {
      return true; // continue traversing
    }

    const id = getStableId(node);
    if (id) {
      blocks.set(id, {
        nodeType,
        idType: getIdType(node),
        textPreview: getTextPreview(node),
        pos,
        sdBlockRev: node.attrs?.sdBlockRev ?? null,
      });
    }
    return true;
  });

  return blocks;
};

/**
 * Add an event to the log
 */
const addEvent = (event) => {
  events.value = [
    { ...event, timestamp: new Date().toISOString(), id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ...events.value,
  ].slice(0, EVENT_LIMIT);
};

/**
 * Compare two snapshots and generate change events
 */
const compareSnapshots = (before, after) => {
  const changes = [];

  // Find new IDs (in after but not in before)
  for (const [id, info] of after) {
    if (!before.has(id)) {
      changes.push({
        type: 'created',
        nodeId: id,
        idType: info.idType,
        nodeType: info.nodeType,
        textPreview: info.textPreview,
      });
    }
  }

  // Find deleted IDs (in before but not in after)
  for (const [id, info] of before) {
    if (!after.has(id)) {
      changes.push({
        type: 'deleted',
        nodeId: id,
        idType: info.idType,
        nodeType: info.nodeType,
        textPreview: info.textPreview,
      });
    }
  }

  // Find modified IDs (same ID, but content changed)
  for (const [id, afterInfo] of after) {
    const beforeInfo = before.get(id);
    if (beforeInfo) {
      // Check if revision changed (indicates content modification)
      if (beforeInfo.sdBlockRev !== afterInfo.sdBlockRev && afterInfo.sdBlockRev != null) {
        changes.push({
          type: 'modified',
          nodeId: id,
          idType: afterInfo.idType,
          nodeType: afterInfo.nodeType,
          textPreview: afterInfo.textPreview,
          revBefore: beforeInfo.sdBlockRev,
          revAfter: afterInfo.sdBlockRev,
        });
      }
      // Check if text preview changed significantly (fallback detection)
      else if (beforeInfo.textPreview !== afterInfo.textPreview) {
        changes.push({
          type: 'content-changed',
          nodeId: id,
          idType: afterInfo.idType,
          nodeType: afterInfo.nodeType,
          textBefore: beforeInfo.textPreview,
          textAfter: afterInfo.textPreview,
        });
      }
    }
  }

  return changes;
};

/**
 * Subscribe to editor updates
 */
const subscribeToEditor = () => {
  const editor = window.editor;
  if (!editor) return;

  // Take initial snapshot
  previousBlockIds = collectBlockIds(editor.state?.doc);

  // Listen to transaction updates
  const onUpdate = ({ editor: updatedEditor, transaction }) => {
    if (!transaction?.docChanged) return;

    const currentBlockIds = collectBlockIds(updatedEditor.state?.doc);
    const changes = compareSnapshots(previousBlockIds, currentBlockIds);

    for (const change of changes) {
      addEvent(change);
    }

    previousBlockIds = currentBlockIds;
  };

  editor.on('update', onUpdate);
  unsubscribe = () => editor.off('update', onUpdate);

  // Log initial state
  addEvent({
    type: 'init',
    message: `Tracking ${previousBlockIds.size} blocks with stable IDs`,
  });
};

const closeSidebar = () => emit('close');

const clearEvents = () => {
  events.value = [];
};

const rescan = () => {
  const editor = window.editor;
  if (!editor) return;
  previousBlockIds = collectBlockIds(editor.state?.doc);
  addEvent({
    type: 'rescan',
    message: `Rescanned: ${previousBlockIds.size} blocks with stable IDs`,
  });
};

const getEventIcon = (type) => {
  switch (type) {
    case 'created':
      return '+';
    case 'deleted':
      return '−';
    case 'modified':
      return '~';
    case 'content-changed':
      return '~';
    case 'init':
      return '●';
    case 'rescan':
      return '↻';
    default:
      return '?';
  }
};

const getEventClass = (type) => {
  switch (type) {
    case 'created':
      return 'event--created';
    case 'deleted':
      return 'event--deleted';
    case 'modified':
    case 'content-changed':
      return 'event--modified';
    default:
      return 'event--info';
  }
};

const formatTime = (iso) => {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const truncateId = (id) => {
  if (!id) return '';
  const str = String(id);
  if (str.length <= 12) return str;
  return str.slice(0, 6) + '...' + str.slice(-4);
};

const blockCount = computed(() => previousBlockIds.size);

onMounted(() => {
  subscribeToEditor();
});

onBeforeUnmount(() => {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }
});
</script>

<template>
  <div class="dev-sidebar">
    <div class="dev-sidebar__header">
      <div class="dev-sidebar__title-row">
        <h3 class="dev-sidebar__title">Stable ID Log</h3>
        <button class="dev-sidebar__close" type="button" aria-label="Close sidebar" @click="closeSidebar">×</button>
      </div>
      <p class="dev-sidebar__subtitle">Tracking {{ blockCount }} blocks</p>
    </div>

    <div class="dev-sidebar__actions">
      <button class="dev-sidebar__button" type="button" @click="rescan">Rescan</button>
      <button class="dev-sidebar__button dev-sidebar__button--secondary" type="button" @click="clearEvents">
        Clear
      </button>
    </div>

    <div class="dev-sidebar__body">
      <div class="dev-sidebar__legend">
        <span class="legend-item legend-item--created">+ created</span>
        <span class="legend-item legend-item--deleted">− deleted</span>
        <span class="legend-item legend-item--modified">~ modified</span>
      </div>

      <div class="events-list">
        <p v-if="events.length === 0" class="dev-sidebar__hint">
          Edit the document to see ID changes. Split a paragraph (Enter), merge (Backspace), or edit text.
        </p>

        <div v-for="event in events" :key="event.id" class="event" :class="getEventClass(event.type)">
          <div class="event__header">
            <span class="event__icon">{{ getEventIcon(event.type) }}</span>
            <span class="event__type">{{ event.type }}</span>
            <span class="event__time">{{ formatTime(event.timestamp) }}</span>
          </div>

          <div v-if="event.type === 'init' || event.type === 'rescan'" class="event__body">
            {{ event.message }}
          </div>

          <div v-else class="event__body">
            <div class="event__row">
              <span class="event__label">ID:</span>
              <code class="event__value event__value--id" :title="event.nodeId">{{ truncateId(event.nodeId) }}</code>
              <span class="event__tag">{{ event.idType }}</span>
            </div>
            <div class="event__row">
              <span class="event__label">Type:</span>
              <span class="event__value">{{ event.nodeType }}</span>
            </div>
            <div v-if="event.textPreview" class="event__row">
              <span class="event__label">Text:</span>
              <span class="event__value event__value--text">{{ event.textPreview || '(empty)' }}</span>
            </div>
            <div v-if="event.type === 'modified'" class="event__row">
              <span class="event__label">Rev:</span>
              <span class="event__value">{{ event.revBefore }} → {{ event.revAfter }}</span>
            </div>
            <div v-if="event.type === 'content-changed'" class="event__row event__row--diff">
              <div class="diff-line diff-line--before">{{ event.textBefore || '(empty)' }}</div>
              <div class="diff-line diff-line--after">{{ event.textAfter || '(empty)' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dev-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #0f172a;
  height: 100%;
}

.dev-sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dev-sidebar__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dev-sidebar__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.dev-sidebar__subtitle {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.dev-sidebar__close {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 18px;
  font-weight: 700;
  padding: 0;
  line-height: 1;
  cursor: pointer;
}

.dev-sidebar__close:hover {
  color: #0f172a;
}

.dev-sidebar__actions {
  display: flex;
  gap: 8px;
}

.dev-sidebar__button {
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.12);
  color: #1e3a8a;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.dev-sidebar__button:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.6);
}

.dev-sidebar__button--secondary {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.4);
  color: #475569;
}

.dev-sidebar__button--secondary:hover {
  background: rgba(148, 163, 184, 0.2);
}

.dev-sidebar__body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dev-sidebar__legend {
  display: flex;
  gap: 12px;
  font-size: 11px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.3);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-item--created {
  color: #16a34a;
}

.legend-item--deleted {
  color: #dc2626;
}

.legend-item--modified {
  color: #ca8a04;
}

.dev-sidebar__hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
  font-size: 12px;
}

.event--created {
  border-left: 3px solid #16a34a;
}

.event--deleted {
  border-left: 3px solid #dc2626;
}

.event--modified {
  border-left: 3px solid #ca8a04;
}

.event--info {
  border-left: 3px solid #3b82f6;
}

.event__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.event__icon {
  font-weight: 700;
  font-size: 14px;
  width: 16px;
  text-align: center;
}

.event--created .event__icon {
  color: #16a34a;
}

.event--deleted .event__icon {
  color: #dc2626;
}

.event--modified .event__icon {
  color: #ca8a04;
}

.event--info .event__icon {
  color: #3b82f6;
}

.event__type {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.03em;
}

.event__time {
  margin-left: auto;
  color: #94a3b8;
  font-size: 10px;
  font-family: monospace;
}

.event__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event__row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.event__label {
  color: #64748b;
  font-size: 11px;
  min-width: 32px;
}

.event__value {
  color: #1e293b;
}

.event__value--id {
  font-family: monospace;
  font-size: 11px;
  background: rgba(148, 163, 184, 0.15);
  padding: 1px 4px;
  border-radius: 3px;
}

.event__value--text {
  font-style: italic;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.event__tag {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.12);
  color: #1e40af;
  font-weight: 600;
}

.event__row--diff {
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.diff-line {
  font-family: monospace;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-line--before {
  background: rgba(220, 38, 38, 0.1);
  color: #991b1b;
}

.diff-line--after {
  background: rgba(22, 163, 74, 0.1);
  color: #166534;
}
</style>
