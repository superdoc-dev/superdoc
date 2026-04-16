<script setup>
import { ref, watch, onMounted } from 'vue';
import { SuperDoc } from 'superdoc';

// State
const file = ref(null);
const loading = ref(false);
const ready = ref(false);
const query = ref('');
const results = ref([]);

// SuperDoc instance
let superdoc = null;

// Handle file selection
const onFileChange = (e) => {
  file.value = e.target.files?.[0] || null;
};

// Initialize SuperDoc
const initSuperdoc = (doc = null) => {
  superdoc?.destroy();
  results.value = [];
  query.value = '';
  loading.value = !!doc;
  ready.value = false;

  superdoc = new SuperDoc({
    selector: '#editor',
    document: doc,
    documentMode: 'editing',
    pagination: true,
    toolbar: 'toolbar',
    toolbarGroups: ['left', 'center', 'right'],
    onReady: () => {
      loading.value = false;
      ready.value = true;
    },
  });
};

// Start with blank doc
onMounted(() => initSuperdoc());

// Reinitialize when file changes
watch(file, (newFile) => {
  if (newFile) initSuperdoc(newFile);
});

// ============================================
// SEARCH CODE
// ============================================

const search = () => {
  if (!superdoc || !query.value.trim()) {
    results.value = [];
    return;
  }

  // Search returns array of matches with { from, to, text }
  results.value = superdoc.search(query.value) ?? [];
};

const goToResult = (result) => {
  // Scrolls to the result and highlights it
  superdoc?.goToSearchResult(result);
};

// ============================================

const truncate = (text, max = 40) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '...' : clean;
};
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <span class="badge">SEARCH DEMO</span>
        <span class="version">v1.25.0</span>
      </div>
      <div class="header-right">
        <label class="file-btn">
          Choose File
          <input type="file" accept=".docx" @change="onFileChange" />
        </label>
        <span class="filename">{{ file?.name || 'No file chosen' }}</span>
      </div>
    </header>

    <!-- Toolbar -->
    <div id="toolbar"></div>

    <!-- Main -->
    <main class="main">
      <!-- Editor -->
      <div id="editor">
        <div v-if="loading" class="loading">Loading...</div>
      </div>

      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">Search</div>
        <div class="sidebar-body">
          <label class="label">Query</label>
          <div class="search-row">
            <input
              v-model="query"
              type="text"
              placeholder="Search..."
              :disabled="!ready"
              @keydown.enter="search"
            />
            <button :disabled="!ready" @click="search">Search</button>
          </div>

          <div class="results">
            <div v-if="results.length === 0" class="hint">No results</div>
            <button
              v-for="(r, i) in results"
              :key="i"
              class="result"
              @click="goToResult(r)"
            >
              <span class="result-index">{{ i + 1 }}.</span>
              <span class="result-text">{{ truncate(r.text) }}</span>
            </button>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #1e293b;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge {
  background: #334155;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
}

.version {
  color: #64748b;
  font-size: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-btn {
  background: #3b82f6;
  color: #fff;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.file-btn:hover {
  background: #2563eb;
}

.file-btn input {
  display: none;
}

.filename {
  color: #cbd5e1;
  font-size: 12px;
}

/* Toolbar */
#toolbar {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

/* Main */
.main {
  display: flex;
  flex: 1;
  min-height: 0;
}

#editor {
  flex: 1;
  overflow: auto;
  background: #e2e8f0;
  position: relative;
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #64748b;
  background: #e2e8f0;
  z-index: 10;
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.search-row {
  display: flex;
  gap: 6px;
}

.search-row input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
}

.search-row button {
  padding: 6px 12px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.search-row button:disabled {
  background: #94a3b8;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hint {
  color: #94a3b8;
  font-size: 12px;
  padding: 8px 0;
}

.result {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
}

.result:hover {
  border-color: #3b82f6;
  background: #f8fafc;
}

.result-index {
  font-weight: 600;
  color: #3b82f6;
}

.result-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
