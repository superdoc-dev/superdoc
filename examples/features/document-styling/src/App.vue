<style>
/* Page shadow - uniform on all sides, similar to Microsoft Word */
.superdoc-page {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid #d4d4d4 !important;
}

/* Font rendering - subpixel antialiasing for crisp text */
.superdoc-layout {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
  -moz-osx-font-smoothing: auto;
}

/* ==========================================================================
 * Demo app styles
 * ========================================================================== */

.superdoc-layout {
  padding: 24px !important;
  width: auto !important;
  min-width: auto !important;
}

.presentation-editor__viewport {
  width: auto !important;
  min-width: auto !important;
  padding: 24px !important;
}

.super-editor-container {
  min-width: auto !important;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

#app {
  height: 100%;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  padding: 0.75rem 1rem;
  background: #f3f3f3;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
  border-bottom: 1px solid #d6d6d6;
}

.open-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 400;
  color: #242424;
  background: #ffffff;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s, border-color 0.1s;
}

.open-button:hover {
  background: #f5f5f5;
  border-color: #c7c7c7;
}

.open-button:active {
  background: #e8e8e8;
}

.open-icon {
  width: 16px;
  height: 16px;
  color: #616161;
}

.editor-wrapper {
  flex: 1;
  overflow: auto;
  background-color: #dedede;
  display: flex;
  justify-content: center;
}

.editor-container {
  width: fit-content;
}
</style>

<template>
  <div class="app">
    <div class="toolbar">
      <input
        ref="fileInput"
        type="file"
        accept=".docx"
        @change="handleFile"
        style="display: none"
      />
      <button class="open-button" @click="openFile">
        <svg class="open-icon" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        Open
      </button>
    </div>
    <div class="editor-wrapper">
      <div ref="container" class="editor-container" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const container = ref<HTMLDivElement>();
const fileInput = ref<HTMLInputElement>();
const file = ref<File | null>(null);
let superdoc: SuperDoc | null = null;

const openFile = () => {
  fileInput.value?.click();
};

const handleFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) file.value = input.files[0];
};

const loadDefaultDocument = async () => {
  try {
    const response = await fetch('/default.docx');
    if (response.ok) {
      const blob = await response.blob();
      file.value = new File([blob], 'default.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }
  } catch (e) {
    console.log('Default document not found, starting with empty editor');
  }
};

const initEditor = () => {
  if (!container.value) return;

  superdoc?.destroy();
  superdoc = new SuperDoc({
    selector: container.value,
    document: file.value,
  });
};

onMounted(async () => {
  await loadDefaultDocument();
  initEditor();
});

watch(file, initEditor);
</script>
