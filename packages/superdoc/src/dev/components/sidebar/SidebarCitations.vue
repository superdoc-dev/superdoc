<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';

const emit = defineEmits(['close']);

// Get the global editor instance
const getEditor = () => window.editor;

// State
const citations = ref([]);
const clickedCitation = ref(null);
const isLoading = ref(false);
const error = ref('');

// Sample citation sources for the demo
const sampleSources = [
  { id: 'smith-2024', label: 'Smith 2024', description: 'Smith, J. (2024). Introduction to AI.' },
  { id: 'jones-2023', label: 'Jones 2023', description: 'Jones, M. (2023). Machine Learning Basics.' },
  { id: 'doe-2022', label: 'Doe 2022', description: 'Doe, A. (2022). Neural Networks.' },
  { id: 'chen-2024', label: 'Chen 2024', description: 'Chen, L. (2024). Deep Learning Applications.' },
];

/**
 * Load existing content controls from the document
 */
const loadCitations = async () => {
  isLoading.value = true;
  error.value = '';

  try {
    const editor = getEditor();
    if (!editor?.doc?.contentControls) {
      error.value = 'Document API not available';
      return;
    }

    const result = editor.doc.contentControls.list();
    citations.value = result.items || [];
  } catch (err) {
    console.error('Failed to load citations:', err);
    error.value = err.message || 'Failed to load citations';
  } finally {
    isLoading.value = false;
  }
};

/**
 * Insert a citation at the current cursor position using contentControls API
 */
const insertCitation = async (source) => {
  error.value = '';

  try {
    const editor = getEditor();
    if (!editor?.doc?.contentControls) {
      error.value = 'Document API not available';
      return;
    }

    // Use editor commands to insert at selection position
    const { from } = editor.state.selection;

    // Insert using editor commands (addFieldAnnotation)
    // This creates a fieldAnnotation node that exports as w:sdt
    editor.commands.addFieldAnnotation(from, {
      type: 'text',
      fieldId: `citation-${Date.now()}`,
      fieldType: 'CITATION',
      displayLabel: `[${source.label}]`,
      fieldColor: '#3b82f6',
    });

    // Refresh the list
    await loadCitations();
  } catch (err) {
    console.error('Failed to insert citation:', err);
    error.value = err.message || 'Failed to insert citation';
  }
};

/**
 * Handle citation click events
 */
const handleCitationClick = ({ node, nodePos, event }) => {
  console.log('Citation clicked:', { node, nodePos });

  // Extract citation info from the node attributes
  const attrs = node?.attrs || {};
  clickedCitation.value = {
    fieldId: attrs.fieldId,
    displayLabel: attrs.displayLabel,
    fieldType: attrs.fieldType,
    position: nodePos,
  };
};

/**
 * Navigate to a citation in the document
 */
const goToCitation = (citation) => {
  const editor = getEditor();
  if (!editor) return;

  try {
    // Try to find the citation by its tag or ID
    const nodeId = citation.id || citation.target?.nodeId;
    if (nodeId) {
      // For content controls, we need to find the node position
      // This is a simplified approach - in practice you might need more robust navigation
      console.log('Navigate to citation:', nodeId);
    }
  } catch (err) {
    console.error('Failed to navigate to citation:', err);
  }
};

/**
 * Remove a citation from the document
 */
const removeCitation = async (citation) => {
  error.value = '';

  try {
    const editor = getEditor();
    if (!editor?.doc?.contentControls) {
      error.value = 'Document API not available';
      return;
    }

    const target = citation.target;
    if (target) {
      editor.doc.contentControls.delete({ target });
      await loadCitations();
    }
  } catch (err) {
    console.error('Failed to remove citation:', err);
    error.value = err.message || 'Failed to remove citation';
  }
};

const closeSidebar = () => {
  emit('close');
};

const clearClickedCitation = () => {
  clickedCitation.value = null;
};

// Lifecycle
onMounted(() => {
  loadCitations();

  // Listen for fieldAnnotation click events
  const editor = getEditor();
  if (editor) {
    editor.on('fieldAnnotationClicked', handleCitationClick);
  }
});

onBeforeUnmount(() => {
  const editor = getEditor();
  if (editor) {
    editor.off('fieldAnnotationClicked', handleCitationClick);
  }
});

// Computed
const hasCitations = computed(() => citations.value.length > 0);
</script>

<template>
  <div class="dev-sidebar">
    <div class="dev-sidebar__header">
      <div class="dev-sidebar__title-row">
        <h3 class="dev-sidebar__title">Citations Demo</h3>
        <button class="dev-sidebar__close" type="button" aria-label="Close sidebar" @click="closeSidebar">×</button>
      </div>
      <p class="dev-sidebar__subtitle">Using Document API <code>contentControls</code> to create clickable citations</p>
    </div>

    <div class="dev-sidebar__body">
      <!-- Clicked Citation Info -->
      <div v-if="clickedCitation" class="citation-clicked">
        <div class="citation-clicked__header">
          <span class="citation-clicked__badge">Clicked!</span>
          <button class="citation-clicked__dismiss" type="button" @click="clearClickedCitation">×</button>
        </div>
        <div class="citation-clicked__content">
          <div class="citation-clicked__field">
            <span class="citation-clicked__label">Display:</span>
            <span class="citation-clicked__value">{{ clickedCitation.displayLabel }}</span>
          </div>
          <div class="citation-clicked__field">
            <span class="citation-clicked__label">Field ID:</span>
            <span class="citation-clicked__value citation-clicked__value--mono">{{ clickedCitation.fieldId }}</span>
          </div>
          <div v-if="clickedCitation.fieldType" class="citation-clicked__field">
            <span class="citation-clicked__label">Type:</span>
            <span class="citation-clicked__value">{{ clickedCitation.fieldType }}</span>
          </div>
        </div>
      </div>

      <!-- Insert Citation Section -->
      <div class="section">
        <h4 class="section__title">Insert Citation</h4>
        <p class="section__hint">Click a source to insert at cursor position</p>
        <div class="source-list">
          <button
            v-for="source in sampleSources"
            :key="source.id"
            class="source-tile"
            type="button"
            @click="insertCitation(source)"
          >
            <span class="source-tile__label">[{{ source.label }}]</span>
            <span class="source-tile__description">{{ source.description }}</span>
          </button>
        </div>
      </div>

      <!-- Existing Citations Section -->
      <div class="section">
        <div class="section__header">
          <h4 class="section__title">Content Controls in Document</h4>
          <button class="section__refresh" type="button" :disabled="isLoading" @click="loadCitations">
            {{ isLoading ? '...' : '↻' }}
          </button>
        </div>

        <div v-if="error" class="section__error">{{ error }}</div>

        <div v-if="!hasCitations && !isLoading" class="section__empty">
          No content controls found. Insert a citation above to get started.
        </div>

        <div v-if="hasCitations" class="citation-list">
          <div v-for="citation in citations" :key="citation.id" class="citation-item">
            <div class="citation-item__info">
              <span class="citation-item__type">{{ citation.controlType || 'text' }}</span>
              <span class="citation-item__text">{{ citation.text || citation.properties?.alias || '(empty)' }}</span>
              <span v-if="citation.properties?.tag" class="citation-item__tag">{{ citation.properties.tag }}</span>
            </div>
            <div class="citation-item__actions">
              <button class="citation-item__btn" type="button" title="Go to" @click="goToCitation(citation)">→</button>
              <button
                class="citation-item__btn citation-item__btn--danger"
                type="button"
                title="Remove"
                @click="removeCitation(citation)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- How It Works Section -->
      <div class="section">
        <h4 class="section__title">How It Works</h4>
        <div class="how-it-works">
          <div class="how-it-works__step">
            <span class="how-it-works__num">1</span>
            <span class="how-it-works__text"
              >Click a source above to insert a <code>fieldAnnotation</code> node at cursor</span
            >
          </div>
          <div class="how-it-works__step">
            <span class="how-it-works__num">2</span>
            <span class="how-it-works__text"
              >The node renders as non-editable inline text with click handlers via
              <code>FieldAnnotationView</code></span
            >
          </div>
          <div class="how-it-works__step">
            <span class="how-it-works__num">3</span>
            <span class="how-it-works__text">Click events fire <code>fieldAnnotationClicked</code> with node data</span>
          </div>
          <div class="how-it-works__step">
            <span class="how-it-works__num">4</span>
            <span class="how-it-works__text">On export, nodes become <code>w:sdt</code> (Word content controls)</span>
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
  gap: 16px;
  color: #0f172a;
}

.dev-sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  line-height: 1.4;
}

.dev-sidebar__subtitle code {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
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

.dev-sidebar__body {
  display: grid;
  gap: 16px;
}

/* Citation Clicked Card */
.citation-clicked {
  background: linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
  padding: 12px;
  animation: pulse-border 0.3s ease;
}

@keyframes pulse-border {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  100% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
  }
}

.citation-clicked__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.citation-clicked__badge {
  background: #2563eb;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.citation-clicked__dismiss {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.citation-clicked__dismiss:hover {
  color: #0f172a;
}

.citation-clicked__content {
  display: grid;
  gap: 6px;
}

.citation-clicked__field {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.citation-clicked__label {
  color: #64748b;
  flex-shrink: 0;
}

.citation-clicked__value {
  color: #1e293b;
  font-weight: 500;
  word-break: break-all;
}

.citation-clicked__value--mono {
  font-family: monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 4px;
  border-radius: 3px;
}

/* Section */
.section {
  display: grid;
  gap: 8px;
}

.section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.section__hint {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
}

.section__refresh {
  border: none;
  background: rgba(148, 163, 184, 0.15);
  color: #475569;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section__refresh:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.25);
}

.section__refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section__error {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.section__empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 12px;
  text-align: center;
  background: rgba(148, 163, 184, 0.08);
  border-radius: 8px;
}

/* Source List */
.source-list {
  display: grid;
  gap: 6px;
}

.source-tile {
  display: grid;
  gap: 2px;
  text-align: left;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.05);
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.source-tile:hover {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.1);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

.source-tile__label {
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
}

.source-tile__description {
  font-size: 11px;
  color: #64748b;
}

/* Citation List */
.citation-list {
  display: grid;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.citation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  padding: 8px 10px;
  background: white;
}

.citation-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.citation-item__type {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.citation-item__text {
  font-size: 12px;
  color: #1e293b;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.citation-item__tag {
  font-size: 10px;
  color: #64748b;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.citation-item__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.citation-item__btn {
  border: none;
  background: rgba(148, 163, 184, 0.15);
  color: #475569;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.citation-item__btn:hover {
  background: rgba(148, 163, 184, 0.25);
}

.citation-item__btn--danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

/* How It Works */
.how-it-works {
  display: grid;
  gap: 8px;
  background: rgba(148, 163, 184, 0.08);
  border-radius: 8px;
  padding: 12px;
}

.how-it-works__step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.how-it-works__num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.how-it-works__text {
  font-size: 11px;
  color: #475569;
  line-height: 1.4;
}

.how-it-works__text code {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}
</style>
