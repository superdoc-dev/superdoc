<template>
  <div class="app">
    <header>
      <h1>Exhibit Insertion Demo</h1>
      <button @click="mainFileInput?.click()">Load Document</button>
      <button class="download-btn" @click="downloadMainDocument" :disabled="!superdoc">
        Download
      </button>
      <input
        type="file"
        ref="mainFileInput"
        accept=".docx"
        class="hidden"
        @change="handleMainFileChange"
      >
    </header>

    <div class="main-content">
      <main class="editor-area">
        <!-- Main document editor (hidden when editing exhibit) -->
        <DocumentEditor
          v-if="!isEditingExhibit"
          ref="documentEditorRef"
          :initial-data="currentMainDocument"
          @superdoc-ready="handleSuperdocReady"
          @editor-ready="handleEditorReady"
        />

        <!-- Exhibit editor (shown when editing exhibit) -->
        <div v-if="isEditingExhibit && selectedExhibitId" class="exhibit-editor-mode">
          <div class="exhibit-editor-header">
            <button class="back-btn" @click="closeExhibitEditor">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Document
            </button>
            <h3>Editing: {{ getExhibitName(selectedExhibitId) }}</h3>
            <div class="exhibit-editor-actions">
              <button
                class="download-btn"
                @click="downloadCurrentExhibit"
                :disabled="!exhibitSuperdoc"
              >
                Download
              </button>
              <button
                class="sync-btn"
                @click="syncExhibit"
                :disabled="!exhibitEditor"
              >
                Sync
              </button>
            </div>
          </div>
          <DocumentEditor
            :key="selectedExhibitId"
            :editor-id="`exhibit-${selectedExhibitId}`"
            :initial-data="currentExhibitDocument"
            @superdoc-ready="handleExhibitSuperdocReady"
            @editor-ready="handleExhibitEditorReady"
          />
        </div>
      </main>

      <aside class="exhibit-panel">
        <div class="panel-header">
          <h2>Exhibits</h2>
          <button class="upload-btn" @click="exhibitFileInput?.click()">
            + Add
          </button>
          <input
            type="file"
            ref="exhibitFileInput"
            accept=".docx"
            class="hidden"
            @change="handleExhibitUpload"
          >
        </div>

        <div class="exhibits-list">
          <div
            v-for="exhibit in exhibitList"
            :key="exhibit.id"
            class="exhibit-card"
            :class="{ selected: selectedExhibitId === exhibit.id }"
          >
            <div class="exhibit-info" @click="openExhibitEditor(exhibit.id)">
              <h3>{{ exhibit.name }}</h3>
              <p>{{ exhibit.description }}</p>
            </div>
            <div class="exhibit-actions">
              <button
                class="action-btn"
                @click.stop="downloadExhibit(exhibit.id)"
                title="Download"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button
                class="action-btn"
                :class="{ active: selectedExhibitId === exhibit.id }"
                @click.stop="openExhibitEditor(exhibit.id)"
                title="Edit exhibit"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                class="insert-btn"
                @click.stop="insertExhibit(exhibit.id)"
                :disabled="!editor"
              >
                Insert
              </button>
            </div>
          </div>

          <div v-if="exhibitList.length === 0" class="empty-state">
            <p>No exhibits yet.</p>
            <p>Click "+ Add" to upload a DOCX file.</p>
          </div>
        </div>

        <div v-if="isInserting" class="inserting-overlay">
          <div class="spinner"></div>
          <span>{{ insertingMessage }}</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, reactive, nextTick } from 'vue';
import { SuperDoc } from 'superdoc';
import DocumentEditor from './components/DocumentEditor.vue';

// ============================================================================
// FILE STORAGE
// ============================================================================

const fileStorage = reactive({
  mainDocument: '/main-document.docx',
  exhibits: new Map([
    ['exhibit-a', {
      name: 'Exhibit A',
      description: 'Sample document for insertion',
      data: '/exhibits/exhibit-a.docx'
    }]
  ])
});

// ============================================================================
// STATE
// ============================================================================

const mainFileInput = ref(null);
const exhibitFileInput = ref(null);
const documentEditorRef = ref(null);
const editor = shallowRef(null);
const superdoc = shallowRef(null);
const exhibitEditor = shallowRef(null);
const exhibitSuperdoc = shallowRef(null);
const isEditingExhibit = ref(false);
const selectedExhibitId = ref(null);
const isInserting = ref(false);
const insertingMessage = ref('');
const pendingSync = ref(null);

const clearMainEditorState = () => {
  editor.value = null;
  superdoc.value = null;
};

const clearExhibitEditorState = () => {
  exhibitEditor.value = null;
  exhibitSuperdoc.value = null;
};

// ============================================================================
// COMPUTED
// ============================================================================

const currentMainDocument = computed(() => fileStorage.mainDocument);

const currentExhibitDocument = computed(() => {
  if (!selectedExhibitId.value) return null;
  return fileStorage.exhibits.get(selectedExhibitId.value)?.data || null;
});

const exhibitList = computed(() => {
  return Array.from(fileStorage.exhibits.entries()).map(([id, exhibit]) => ({
    id,
    name: exhibit.name,
    description: exhibit.description
  }));
});

const getExhibitName = (id) => fileStorage.exhibits.get(id)?.name || 'Unknown';
const getExhibitGroup = (exhibitId) => `exhibit_${exhibitId}`;

// ============================================================================
// EXPORT HELPERS
// ============================================================================

/**
 * Export a SuperDoc instance to a DOCX blob
 */
const exportToBlob = async (instance) => {
  if (!instance) return null;
  const blob = await instance.export({ triggerDownload: false });
  return (blob && blob.size > 0) ? blob : null;
};

/**
 * Download a blob as a file
 */
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Load exhibit from storage as a Blob (fetching if URL)
 */
const loadExhibitBlob = async (exhibitId) => {
  const exhibit = fileStorage.exhibits.get(exhibitId);
  if (!exhibit) return null;
  if (exhibit.data instanceof Blob) return exhibit.data;
  const response = await fetch(exhibit.data);
  return response.blob();
};

/**
 * Load exhibit as JSON for insertion/sync (ProseMirror needs JSON, not DOCX)
 * Uses current editor if exhibit is open, otherwise creates a hidden parser
 */
const loadExhibitAsJSON = async (exhibitId) => {
  const exhibit = fileStorage.exhibits.get(exhibitId);
  if (!exhibit) throw new Error('Exhibit not found');

  // Use current editor if this exhibit is already open
  if (selectedExhibitId.value === exhibitId && exhibitEditor.value) {
    return exhibitEditor.value.getJSON();
  }

  // Parse DOCX via hidden SuperDoc instance
  const docxData = await loadExhibitBlob(exhibitId);
  return parseDocxToJSON(docxData);
};

/**
 * Parse a DOCX blob to ProseMirror JSON using a hidden SuperDoc instance
 */
const parseDocxToJSON = (docxBlob) => {
  const hiddenContainer = document.createElement('div');
  hiddenContainer.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(hiddenContainer);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout parsing document'));
    }, 10000);

    let tempSuperdoc;
    const cleanup = () => {
      clearTimeout(timeout);
      try { tempSuperdoc?.destroy(); } catch {}
      document.body.removeChild(hiddenContainer);
    };

    tempSuperdoc = new SuperDoc({
      selector: hiddenContainer,
      document: docxBlob,
      documentMode: 'viewing',
      pagination: false,
      rulers: false,
    });

    tempSuperdoc.on('editorCreate', ({ editor: tempEditor }) => {
      setTimeout(() => {
        try {
          resolve(tempEditor.getJSON());
        } catch (err) {
          reject(err);
        } finally {
          cleanup();
        }
      }, 300);
    });

    tempSuperdoc.on('error', (error) => {
      cleanup();
      reject(error);
    });
  });
};

// ============================================================================
// MAIN DOCUMENT LIFECYCLE
// ============================================================================

const saveMainDocument = async () => {
  try {
    const blob = await exportToBlob(superdoc.value);
    if (blob) {
      fileStorage.mainDocument = blob;
      return true;
    }
  } catch (err) {
    console.error('Failed to save main document:', err);
  }
  return false;
};

const downloadMainDocument = async () => {
  try {
    const blob = await exportToBlob(superdoc.value);
    if (!blob) throw new Error('Export failed');
    downloadBlob(blob, 'document.docx');
  } catch (error) {
    console.error('Failed to download:', error);
    alert(`Failed to download: ${error.message}`);
  }
};

// ============================================================================
// EXHIBIT LIFECYCLE
// ============================================================================

const saveExhibit = async (exhibitId) => {
  const exhibit = fileStorage.exhibits.get(exhibitId);
  if (!exhibit) return false;
  try {
    const blob = await exportToBlob(exhibitSuperdoc.value);
    if (blob) {
      exhibit.data = blob;
      return true;
    }
  } catch (err) {
    console.error('Failed to save exhibit:', err);
  }
  return false;
};

const downloadExhibit = async (exhibitId) => {
  const exhibit = fileStorage.exhibits.get(exhibitId);
  if (!exhibit) return;
  try {
    const blob = await loadExhibitBlob(exhibitId);
    if (blob) downloadBlob(blob, `${exhibit.name}.docx`);
  } catch (error) {
    console.error('Failed to download:', error);
    alert('Failed to download exhibit');
  }
};

const downloadCurrentExhibit = async () => {
  if (!selectedExhibitId.value) return;
  try {
    const blob = await exportToBlob(exhibitSuperdoc.value);
    if (!blob) throw new Error('Export failed');
    downloadBlob(blob, `${getExhibitName(selectedExhibitId.value)}.docx`);
  } catch (error) {
    console.error('Failed to download:', error);
    alert(`Failed to download: ${error.message}`);
  }
};

const insertExhibit = async (exhibitId) => {
  if (!editor.value) {
    alert('Please load a document first');
    return;
  }

  isInserting.value = true;
  insertingMessage.value = 'Inserting exhibit...';

  try {
    const docJson = await loadExhibitAsJSON(exhibitId);
    if (!docJson?.content?.length) throw new Error('Exhibit document is empty');

    const exhibit = fileStorage.exhibits.get(exhibitId);
    const sdtNode = {
      type: 'structuredContentBlock',
      attrs: {
        id: String(Math.floor(Math.random() * 2147483647)),
        alias: exhibit?.name || exhibitId,
        tag: JSON.stringify({ group: getExhibitGroup(exhibitId) }),
      },
      content: docJson.content,
    };

    // Note: Using commands.insertContent as Document API doesn't support
    // inserting content controls with content in a single operation yet.
    // Would need: insert content → select range → contentControls.wrap
    editor.value.commands.insertContent(sdtNode, { contentType: 'schema' });
  } catch (error) {
    console.error('Failed to insert:', error);
    alert(`Failed to insert exhibit: ${error.message}`);
  } finally {
    isInserting.value = false;
  }
};

const syncExhibit = async () => {
  if (!exhibitEditor.value || !selectedExhibitId.value) return;

  try {
    const content = exhibitEditor.value.getJSON();
    if (!content?.content?.length) throw new Error('Exhibit document is empty');

    pendingSync.value = {
      exhibitId: selectedExhibitId.value,
      content
    };

    await closeExhibitEditor();
  } catch (error) {
    console.error('Failed to sync:', error);
    alert(`Failed to sync: ${error.message}`);
  }
};

const applySyncOperation = async (syncOp) => {
  const { exhibitId, content } = syncOp;
  const group = getExhibitGroup(exhibitId);

  const sdts = editor.value.helpers.structuredContentCommands.getStructuredContentByGroup(
    group,
    editor.value.state
  );

  if (sdts.length === 0) return;

  // Process in reverse order to maintain correct positions
  const sortedSdts = [...sdts].sort((a, b) => b.pos - a.pos);
  const { schema } = editor.value;
  let tr = editor.value.state.tr;

  for (const { node, pos } of sortedSdts) {
    const newContent = content.content.map(nodeJson => schema.nodeFromJSON(nodeJson));
    const updatedNode = node.type.create(node.attrs, newContent, node.marks);
    tr = tr.replaceWith(pos, pos + node.nodeSize, updatedNode);
  }

  editor.value.view.dispatch(tr);
};

// ============================================================================
// FILE UPLOAD HANDLERS
// ============================================================================

const handleMainFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) fileStorage.mainDocument = file;
};

const handleExhibitUpload = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    const id = `exhibit-${Date.now()}`;
    fileStorage.exhibits.set(id, {
      name: file.name.replace('.docx', ''),
      description: 'Uploaded exhibit',
      data: file
    });
    openExhibitEditor(id);
    event.target.value = '';
  }
};

// ============================================================================
// EDITOR EVENTS
// ============================================================================

const handleSuperdocReady = (instance) => {
  superdoc.value = instance;
};

const handleEditorReady = async (instance) => {
  editor.value = instance;
  if (pendingSync.value) {
    await nextTick();
    await applySyncOperation(pendingSync.value);
    pendingSync.value = null;
  }
};

const handleExhibitSuperdocReady = (instance) => {
  exhibitSuperdoc.value = instance;
};

const handleExhibitEditorReady = (instance) => {
  exhibitEditor.value = instance;
};

// ============================================================================
// EXHIBIT EDITOR NAVIGATION
// ============================================================================

const openExhibitEditor = async (exhibitId) => {
  if (selectedExhibitId.value === exhibitId) return;

  // Save main document before switching
  if (superdoc.value && !isEditingExhibit.value) {
    const saved = await saveMainDocument();
    if (!saved) {
      alert('Failed to save document state');
      return;
    }
  }

  // Switch to exhibit mode
  isEditingExhibit.value = true;
  selectedExhibitId.value = exhibitId;
  clearMainEditorState();
  clearExhibitEditorState();
};

const closeExhibitEditor = async () => {
  if (selectedExhibitId.value) {
    await saveExhibit(selectedExhibitId.value);
  }
  isEditingExhibit.value = false;
  selectedExhibitId.value = null;
  clearExhibitEditorState();
};
</script>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

header {
  padding: 1rem;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}

header h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

header button {
  padding: 0.5rem 1rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

header button:hover {
  background: #0044ff;
}

header button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hidden {
  display: none;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.exhibit-panel {
  width: 280px;
  background: #fff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.panel-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.upload-btn {
  padding: 0.375rem 0.75rem;
  background: #f0f0f0;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.upload-btn:hover {
  background: #e0e0e0;
}

.exhibits-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.exhibit-card {
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  transition: all 0.15s ease;
}

.exhibit-card:hover {
  background: #f0f7ff;
  border-color: #1355ff;
}

.exhibit-card.selected {
  background: #e8f0ff;
  border-color: #1355ff;
  box-shadow: 0 0 0 2px rgba(19, 85, 255, 0.2);
}

.exhibit-info {
  cursor: pointer;
}

.exhibit-info h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
}

.exhibit-info p {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #666;
}

.exhibit-actions {
  display: flex;
  gap: 0.375rem;
  margin-top: 0.625rem;
}

.action-btn {
  padding: 0.375rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  border: 1px solid #d0d0d0;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover:not(:disabled) {
  background: #f0f0f0;
  color: #333;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.active {
  background: #1355ff;
  border-color: #1355ff;
  color: white;
}

.insert-btn {
  padding: 0.375rem 0.75rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.insert-btn:hover:not(:disabled) {
  background: #0044ff;
}

.insert-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 1.5rem 1rem;
  color: #888;
}

.empty-state p {
  margin: 0.25rem 0;
  font-size: 0.8rem;
}

.inserting-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 10;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e0e0e0;
  border-top-color: #1355ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Exhibit Editor Mode */
.exhibit-editor-mode {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.exhibit-editor-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  border-radius: 8px 8px 0 0;
}

.exhibit-editor-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  flex: 1;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f0f0f0;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  color: #333;
}

.back-btn:hover {
  background: #e0e0e0;
}

.exhibit-editor-actions {
  display: flex;
  gap: 0.5rem;
}

.sync-btn, .download-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.sync-btn {
  background: #1355ff;
  color: white;
}

.sync-btn:hover:not(:disabled) {
  background: #0044ff;
}

.download-btn {
  background: #f0f0f0;
  color: #333;
}

.download-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.sync-btn:disabled, .download-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

header .download-btn {
  background: #f0f0f0;
  color: #333;
  border: 1px solid #d0d0d0;
}

header .download-btn:hover:not(:disabled) {
  background: #e0e0e0;
}
</style>
