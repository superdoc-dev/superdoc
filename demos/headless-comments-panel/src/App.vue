<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import CommentsPanel from './components/CommentsPanel.vue';

// State
const superdoc = shallowRef(null);
const editor = shallowRef(null);
const showPanel = ref(true);
const uploadedFileName = ref('');
const isReady = ref(false);

// Initialize SuperDoc
const initSuperdoc = async (file = null) => {
  // Destroy existing instance
  if (superdoc.value) {
    superdoc.value.destroy();
    superdoc.value = null;
    editor.value = null;
    isReady.value = false;
  }

  const config = {
    selector: '#superdoc-container',
    documentMode: 'editing',
    licenseKey: 'public_license_key_superdocinternal_ad7035140c4b',
    comments: { visible: true },
    modules: {
      toolbar: {
        selector: '#toolbar',
      },
      trackChanges: { visible: true },
    },
    onEditorCreate: ({ editor: ed }) => {
      editor.value = ed;
      window.editor = ed;
      isReady.value = true;
    },
  };

  // Add document if file provided
  if (file) {
    config.document = { data: file, id: 'doc-1' };
  }

  superdoc.value = new SuperDoc(config);
  window.superdoc = superdoc.value;
};

// Handle file upload
const handleFileUpload = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  uploadedFileName.value = file.name;
  await initSuperdoc(file);
};

// Export document
const exportDocx = async () => {
  if (!superdoc.value) return;
  await superdoc.value.export();
};

// Toggle panel
const togglePanel = () => {
  showPanel.value = !showPanel.value;
};

onMounted(() => {
  // Initialize with blank document
  initSuperdoc();
});

onBeforeUnmount(() => {
  if (superdoc.value) {
    superdoc.value.destroy();
  }
});
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-brand">
        <h1>SuperDoc</h1>
        <span class="header-subtitle">Headless Comments Panel Demo</span>
      </div>
      <div class="header-actions">
        <div class="upload-control">
          <label class="upload-btn">
            Upload DOCX
            <input type="file" accept=".docx" @change="handleFileUpload" />
          </label>
          <span v-if="uploadedFileName" class="filename">{{ uploadedFileName }}</span>
        </div>
        <button class="btn" :class="{ 'btn--active': showPanel }" @click="togglePanel">
          {{ showPanel ? 'Hide Panel' : 'Show Panel' }}
        </button>
        <button class="btn btn--primary" @click="exportDocx">Export DOCX</button>
      </div>
    </header>

    <!-- Toolbar -->
    <div id="toolbar" class="toolbar"></div>

    <!-- Main content -->
    <main class="main">
      <div class="editor-area">
        <div id="superdoc-container" class="superdoc-container"></div>
      </div>
      <aside v-if="showPanel" class="sidebar">
        <CommentsPanel :is-ready="isReady" @close="showPanel = false" />
      </aside>
    </main>
  </div>
</template>

<style>
/* Global resets */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #e2e8f0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #0f172a;
  color: #f8fafc;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-brand h1 {
  font-size: 20px;
  font-weight: 700;
}

.header-subtitle {
  font-size: 13px;
  color: #94a3b8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 8px;
  color: #93c5fd;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.upload-btn:hover {
  background: rgba(59, 130, 246, 0.3);
}

.upload-btn input {
  display: none;
}

.filename {
  font-size: 12px;
  color: #94a3b8;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn {
  padding: 8px 16px;
  background: rgba(148, 163, 184, 0.15);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  color: #e2e8f0;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: rgba(148, 163, 184, 0.25);
}

.btn--active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.4);
  color: #93c5fd;
}

.btn--primary {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
  color: #86efac;
}

.btn--primary:hover {
  background: rgba(34, 197, 94, 0.3);
}

.toolbar {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  min-height: 44px;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 20px;
}

.superdoc-container {
  width: 100%;
  max-width: 900px;
}

.sidebar {
  width: 560px;
  background: #f8fafc;
  border-left: 1px solid #e2e8f0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Responsive */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }

  .header-actions {
    flex-wrap: wrap;
    justify-content: center;
  }

  .sidebar {
    position: fixed;
    right: 0;
    top: 0;
    height: 100vh;
    z-index: 1000;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  }
}
</style>
