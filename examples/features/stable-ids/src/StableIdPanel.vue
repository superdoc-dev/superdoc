<template>
  <div class="panel">
    <div class="panel-header">
      <h2>ID Change Log</h2>
      <span class="badge">{{ blockCount }} blocks</span>
    </div>

    <div class="panel-actions">
      <button @click="rescan">Rescan</button>
      <button @click="clearEvents" class="secondary">Clear</button>
    </div>

    <details class="info-box" open>
      <summary>Info</summary>
      <div class="info-content">
        <p class="info-section-title">ID Sources</p>
        <div class="info-row">
          <span class="info-label">paraId</span>
          <span class="info-desc">OOXML <code>w14:paraId</code>. Stable across sessions.</span>
        </div>
        <div class="info-row">
          <span class="info-label">UUID</span>
          <span class="info-desc">Generated at load. Session-scoped.</span>
        </div>
        <div class="info-row">
          <span class="info-label">sdBlockId</span>
          <span class="info-desc">SuperDoc persistent ID.</span>
        </div>

        <p class="info-section-title">Change Events</p>
        <div class="info-row">
          <span class="info-label">Edit</span>
          <span class="info-desc">Same ID, rev increments</span>
        </div>
        <div class="info-row">
          <span class="info-label">Split</span>
          <span class="info-desc">New block → new UUID</span>
        </div>
        <div class="info-row">
          <span class="info-label">Merge</span>
          <span class="info-desc">Deleted block's ID gone</span>
        </div>
      </div>
    </details>

    <div class="legend">
      <span class="legend-item created">+ created</span>
      <span class="legend-item deleted">- deleted</span>
      <span class="legend-item modified">~ modified</span>
    </div>

    <div class="hint" v-if="!editor">
      Waiting for editor...
    </div>

    <div class="hint" v-else-if="events.length === 0">
      <strong>Try these actions:</strong>
      <ul>
        <li><kbd>Enter</kbd> to split a paragraph (creates new ID)</li>
        <li><kbd>Backspace</kbd> at line start to merge (deletes ID)</li>
        <li>Type text to modify content (same ID, rev increments)</li>
      </ul>
    </div>

    <div class="events">
      <div
        v-for="event in events"
        :key="event.id"
        class="event"
        :class="'event--' + event.type"
      >
        <div class="event-header">
          <span class="event-icon">{{ getIcon(event.type) }}</span>
          <span class="event-type">{{ event.type }}</span>
          <span class="event-time">{{ formatTime(event.timestamp) }}</span>
        </div>

        <div v-if="event.message" class="event-message">
          {{ event.message }}
        </div>

        <div v-else class="event-body">
          <div class="event-row">
            <span class="label">ID:</span>
            <code class="id" :title="event.nodeId">{{ truncateId(event.nodeId) }}</code>
            <span class="tag">{{ event.idType }}</span>
          </div>
          <div class="event-row">
            <span class="label">Type:</span>
            <span>{{ event.nodeType }}</span>
          </div>
          <div v-if="event.textPreview" class="event-row">
            <span class="label">Text:</span>
            <span class="text-preview">{{ event.textPreview || '(empty)' }}</span>
          </div>
          <div v-if="event.type === 'modified'" class="event-row">
            <span class="label">Rev:</span>
            <span>{{ event.revBefore }} → {{ event.revAfter }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue';

const props = defineProps<{
  editor: any;
}>();

const events = ref<any[]>([]);
const EVENT_LIMIT = 15;
let previousBlockIds = new Map();
let unsubscribe: (() => void) | null = null;

const getStableId = (node: any) => {
  const attrs = node?.attrs;
  if (!attrs) return null;
  return attrs.paraId ?? attrs.sdBlockId ?? null;
};

const getIdType = (node: any) => {
  const attrs = node?.attrs;
  if (!attrs) return 'none';
  if (attrs.paraId) return 'paraId';
  if (attrs.sdBlockId) {
    const id = String(attrs.sdBlockId);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return 'UUID';
    }
    return 'sdBlockId';
  }
  return 'none';
};

const getTextPreview = (node: any) => {
  if (!node) return '';
  const text = node.textContent ?? '';
  if (text.length <= 20) return text;
  return text.slice(0, 20) + '...';
};

const collectBlockIds = (doc: any) => {
  const blocks = new Map();
  if (!doc) return blocks;

  doc.descendants((node: any, pos: number) => {
    const nodeType = node.type?.name;
    if (!['paragraph', 'heading', 'listItem', 'table', 'tableRow', 'tableCell'].includes(nodeType)) {
      return true;
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

const addEvent = (event: any) => {
  // For modified events, check if we already have one for this nodeId
  // If so, update it in place and bump to top instead of creating a new card
  if (event.type === 'modified') {
    const existingIndex = events.value.findIndex(
      (e) => e.type === 'modified' && e.nodeId === event.nodeId
    );

    if (existingIndex !== -1) {
      const existing = events.value[existingIndex];
      // Update the existing event with new revision info
      const updated = {
        ...existing,
        revAfter: event.revAfter,
        textPreview: event.textPreview,
        timestamp: new Date().toISOString(),
        // Keep the original revBefore to show full range
      };
      // Remove from current position and add to top
      const newEvents = [...events.value];
      newEvents.splice(existingIndex, 1);
      events.value = [updated, ...newEvents].slice(0, EVENT_LIMIT);
      return;
    }
  }

  events.value = [
    { ...event, timestamp: new Date().toISOString(), id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ...events.value,
  ].slice(0, EVENT_LIMIT);
};

const compareSnapshots = (before: Map<string, any>, after: Map<string, any>) => {
  const changes: any[] = [];

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

  for (const [id, afterInfo] of after) {
    const beforeInfo = before.get(id);
    if (beforeInfo) {
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
    }
  }

  return changes;
};

const subscribeToEditor = (editor: any) => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  if (!editor) return;

  previousBlockIds = collectBlockIds(editor.state?.doc);

  const onUpdate = ({ editor: updatedEditor, transaction }: any) => {
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

  addEvent({
    type: 'init',
    message: `Tracking ${previousBlockIds.size} blocks with stable IDs`,
  });
};

watch(() => props.editor, (newEditor) => {
  subscribeToEditor(newEditor);
}, { immediate: true });

const clearEvents = () => {
  events.value = [];
};

const rescan = () => {
  if (!props.editor) return;
  previousBlockIds = collectBlockIds(props.editor.state?.doc);
  addEvent({
    type: 'rescan',
    message: `Rescanned: ${previousBlockIds.size} blocks`,
  });
};

const getIcon = (type: string) => {
  switch (type) {
    case 'created': return '+';
    case 'deleted': return '-';
    case 'modified': return '~';
    case 'init': return '●';
    case 'rescan': return '↻';
    default: return '?';
  }
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const truncateId = (id: string) => {
  if (!id) return '';
  const str = String(id);
  if (str.length <= 12) return str;
  return str.slice(0, 6) + '...' + str.slice(-4);
};

const formatXml = (event: any) => {
  const id = event.nodeId || '...';
  const text = event.textPreview || '...';
  const tag = event.nodeType === 'heading' ? 'w:p' : 'w:p';

  if (event.idType === 'paraId') {
    return `<${tag} w14:paraId="${id}">\n  <w:r><w:t>${text}</w:t></w:r>\n</${tag}>`;
  } else {
    return `<${tag}> <!-- sdBlockId="${id}" -->\n  <w:r><w:t>${text}</w:t></w:r>\n</${tag}>`;
  }
};

const blockCount = computed(() => previousBlockIds.size);

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe();
});
</script>

<style scoped>
.panel {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.panel-header h2 {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
}

.badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 999px;
  font-weight: 600;
}

.panel-actions {
  display: flex;
  gap: 0.5rem;
}

.panel-actions button {
  padding: 0.375rem 0.75rem;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.panel-actions button:hover {
  background: #dbeafe;
}

.panel-actions button.secondary {
  border-color: #cbd5e1;
  background: #f1f5f9;
  color: #475569;
}

.info-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.5rem;
  font-size: 0.75rem;
}

.info-box summary {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  color: #166534;
  user-select: none;
}

.info-box summary:hover {
  background: #dcfce7;
  border-radius: 0.5rem;
}

.info-box[open] summary {
  border-bottom: 1px solid #bbf7d0;
  border-radius: 0.5rem 0.5rem 0 0;
}

.info-content {
  padding: 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.info-section-title {
  font-weight: 600;
  color: #166534;
  margin: 0.5rem 0 0.25rem 0;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.info-section-title:first-child {
  margin-top: 0;
}

.info-row {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.info-label {
  font-weight: 600;
  color: #374151;
  min-width: 70px;
  flex-shrink: 0;
}

.info-desc {
  color: #6b7280;
}

.info-desc code {
  background: #d1fae5;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
}

.info-card {
  background: #ffffff;
  border: 1px solid #d1fae5;
  border-radius: 0.375rem;
  overflow: hidden;
  margin-bottom: 0.375rem;
}

.info-card-header {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.375rem 0.5rem;
  background: #f0fdf4;
  border-bottom: 1px solid #d1fae5;
}

.xml-fragment {
  margin: 0;
  padding: 0.375rem 0.5rem;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.625rem;
  line-height: 1.4;
  color: #64748b;
  background: #fafafa;
  overflow-x: auto;
  white-space: pre;
}

.xml-highlight {
  color: #059669;
  font-weight: 600;
}

.legend {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e2e8f0;
}

.legend-item.created { color: #16a34a; }
.legend-item.deleted { color: #dc2626; }
.legend-item.modified { color: #ca8a04; }

.hint {
  color: #64748b;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.hint ul {
  margin-top: 0.5rem;
  padding-left: 1.25rem;
}

.hint li {
  margin: 0.25rem 0;
}

.hint kbd {
  background: #e2e8f0;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
}

.events {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.625rem;
  background: white;
}

.event--created { border-left: 3px solid #16a34a; }
.event--deleted { border-left: 3px solid #dc2626; }
.event--modified { border-left: 3px solid #ca8a04; }
.event--init, .event--rescan { border-left: 3px solid #3b82f6; }

.event-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.375rem;
}

.event-icon {
  font-weight: 700;
  font-size: 0.875rem;
  width: 1rem;
  text-align: center;
}

.event--created .event-icon { color: #16a34a; }
.event--deleted .event-icon { color: #dc2626; }
.event--modified .event-icon { color: #ca8a04; }
.event--init .event-icon, .event--rescan .event-icon { color: #3b82f6; }

.event-type {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.625rem;
  letter-spacing: 0.03em;
}

.event-time {
  margin-left: auto;
  color: #94a3b8;
  font-size: 0.625rem;
  font-family: monospace;
}

.event-message {
  color: #475569;
}

.event-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.event-row {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.label {
  color: #64748b;
  font-size: 0.6875rem;
  min-width: 2rem;
}

.id {
  font-family: monospace;
  font-size: 0.6875rem;
  background: #f1f5f9;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}

.tag {
  font-size: 0.5625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: #eff6ff;
  color: #1e40af;
  font-weight: 600;
}

.text-preview {
  font-style: italic;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.event-xml {
  margin: 0.5rem 0 0 0;
  padding: 0.375rem 0.5rem;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.625rem;
  line-height: 1.4;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.25rem;
  overflow-x: auto;
  white-space: pre;
}
</style>
