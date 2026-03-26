<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const BRACKET_PATTERN = /\[\[\s*([^\]]+?)\s*\]\]/g;

/**
 * Find all [[ bracketed text ]] patterns and replace with citation field annotations.
 */
function replaceBracketedTextWithCitations(editor: any) {
  if (!editor) return;

  const matches: Array<{ from: number; to: number; label: string }> = [];
  editor.state.doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    for (const match of node.text.matchAll(BRACKET_PATTERN)) {
      matches.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
        label: match[1].trim(),
      });
    }
  });

  if (!matches.length) return;

  const replacements = matches.map(({ from, to, label }) => ({
    from,
    to,
    attrs: {
      type: 'text',
      fieldId: `citation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fieldType: 'CITATION',
      displayLabel: `[${label}]`,
      fieldColor: '#2563eb',
    },
  }));

  editor.commands.replaceWithFieldAnnotation(replacements);
}

// State
const editorContainer = ref<HTMLDivElement>();
const superdoc = shallowRef<SuperDoc | null>(null);
const editorInstance = shallowRef<any>(null);
const activeCitation = ref<{ node: any; nodePos: number } | null>(null);

/**
 * Handle citation click in the document
 */
const handleCitationClick = (event: { node: any; nodePos: number }) => {
  if (event.node.attrs.fieldType === 'CITATION') {
    activeCitation.value = event;
  }
};

/**
 * Handle file import
 */
const handleFileImport = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  initEditor(file);
  input.value = '';
};

/**
 * Handle export
 */
const handleExport = async () => {
  if (!superdoc.value) return;
  await superdoc.value.export();
};

/**
 * Initialize the editor
 */
const initEditor = (file?: File | Blob) => {
  if (!editorContainer.value) return;

  superdoc.value?.destroy();
  activeCitation.value = null;

  superdoc.value = new SuperDoc({
    selector: editorContainer.value,
    document: file || undefined,
    documentMode: 'editing',
    annotations: true,
    onEditorCreate: ({ editor }) => {
      editorInstance.value = editor;

      editorInstance.value.on('fieldAnnotationClicked', handleCitationClick);

      setTimeout(() => {
        replaceBracketedTextWithCitations(editorInstance.value);
      }, 500);
    },
  });
};

/**
 * Load the default example document
 */
const loadDefaultDocument = async () => {
  try {
    const response = await fetch('/example.docx');
    if (!response.ok) {
      console.warn('Could not load default document, starting with blank');
      initEditor();
      return;
    }
    const blob = await response.blob();
    initEditor(blob);
  } catch (err) {
    console.warn('Error loading default document:', err);
    initEditor();
  }
};

onMounted(() => {
  loadDefaultDocument();
});

onBeforeUnmount(() => {
  superdoc.value?.destroy();
});
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header__left">
        <h1 class="header__title">Citations Demo via Field Annotations</h1>
        <span class="header__badge">SuperDoc</span>
      </div>
      <div class="header__right">
        <label class="header__upload">
          <span class="header__btn">Import DOCX</span>
          <input type="file" accept=".docx" @change="handleFileImport" />
        </label>
        <button class="header__btn" @click="handleExport">Export DOCX</button>
      </div>
    </header>

    <!-- Main content -->
    <main class="main">
      <div ref="editorContainer" class="editor-container"></div>

      <!-- Citation Sidebar -->
      <aside class="sidebar">
        <div class="sidebar__header">
          <h2 class="sidebar__title">Citation Details</h2>
        </div>
        <div v-if="activeCitation" class="sidebar__content">
          <div class="citation-section">
            <h3 class="citation-section__title">Field Attributes</h3>
            <pre class="citation-section__code">{{ JSON.stringify({
  type: activeCitation.node.attrs.type,
  fieldId: activeCitation.node.attrs.fieldId,
  fieldType: activeCitation.node.attrs.fieldType,
  displayLabel: activeCitation.node.attrs.displayLabel,
  fieldColor: activeCitation.node.attrs.fieldColor,
}, null, 2) }}</pre>
          </div>
        </div>
        <div v-else class="sidebar__empty">
          Click a citation in the document to view details
        </div>
      </aside>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f1f5f9;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #0f172a;
  color: white;
  flex-shrink: 0;
}

.header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header__title {
  font-size: 18px;
  font-weight: 600;
}

.header__badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  color: #93c5fd;
}

.header__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header__upload {
  position: relative;
  cursor: pointer;
}

.header__upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.header__btn {
  padding: 8px 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.header__btn:hover {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.5);
}

/* Main */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.editor-container {
  flex: 1;
  overflow: auto;
  background: #e2e8f0;
}

/* Sidebar */
.sidebar {
  width: 360px;
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar__header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar__title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.sidebar__empty {
  padding: 24px 16px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}

/* Citation Section */
.citation-section {
  margin-bottom: 20px;
}

.citation-section__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 6px;
}

.citation-section__value {
  font-size: 14px;
  color: #0f172a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.citation-section__code {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  color: #334155;
  line-height: 1.5;
}
</style>
