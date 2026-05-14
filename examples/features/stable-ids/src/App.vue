<template>
  <div class="app">
    <header class="header">
      <h1>SuperDoc ID Visualizer</h1>
      <p class="subtitle">
        See how block IDs persist or change as you edit
      </p>
      <div class="header-actions">
        <input type="file" accept=".docx" @change="handleFile" />
        <button class="export-btn" @click="exportDocx" :disabled="!superdocRef">Export DOCX</button>
      </div>
    </header>

    <div class="main">
      <div ref="container" class="editor-container" />
      <StableIdPanel :editor="editor" class="panel" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import StableIdPanel from './StableIdPanel.vue';

const container = ref<HTMLDivElement>();
const file = ref<File | null>(null);
const editor = shallowRef<any>(null);
const superdocRef = shallowRef<SuperDoc | null>(null);
let superdoc: SuperDoc | null = null;

const exportDocx = async () => {
  if (!superdoc) return;
  await superdoc.export({ exportedName: 'SuperDoc-ID-Visualizer' });
};

const handleFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) file.value = input.files[0];
};

const initEditor = () => {
  if (!container.value) return;

  superdoc?.destroy();
  superdoc = new SuperDoc({
    selector: container.value,
    document: file.value,
    onEditorCreate: ({ editor: ed }) => {
      editor.value = ed;
      // Also expose globally for debugging
      (window as any).editor = ed;
    },
  });
  superdocRef.value = superdoc;
};

onMounted(initEditor);
watch(file, initEditor);
</script>

<style>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  color: white;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.header h1 {
  font-size: 1.25rem;
  font-weight: 700;
}

.subtitle {
  font-size: 0.875rem;
  color: #94a3b8;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
}

.export-btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.export-btn:hover:not(:disabled) {
  background: #2563eb;
}

.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-container {
  flex: 1;
  overflow: auto;
  background: #e2e8f0;
}

.panel {
  width: 380px;
  flex-shrink: 0;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  overflow: auto;
}
</style>
