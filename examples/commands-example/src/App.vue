<template>
  <div class="app">
    <header>
      <h1>SuperDoc Commands Explorer</h1>
      <button @click="fileInput?.click()">Load Document</button>
      <input
        type="file"
        ref="fileInput"
        accept=".docx,.pdf"
        class="hidden"
        @change="handleFileChange"
      >
    </header>

    <div class="main-content">
      <aside class="sidebar">
        <CommandsPanel :editor="superdocInstance" />
      </aside>

      <main>
        <DocumentEditor
          :initial-data="documentFile"
          @editor-ready="handleEditorReady"
        />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import DocumentEditor from './components/DocumentEditor.vue';
import CommandsPanel from './components/CommandsPanel.vue';

const documentFile = ref(null);
const fileInput = ref(null);
const superdocInstance = ref(null);

const handleFileChange = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    documentFile.value = file;
  }
};

const handleEditorReady = (editor) => {
  console.log('SuperDoc editor is ready', editor);
  superdocInstance.value = editor;
};
</script>

<style>
* {
  box-sizing: border-box;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  padding: 0.75rem 1rem;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
}

header h1 {
  margin: 0;
  font-size: 1.25rem;
}

header button {
  padding: 0.5rem 1rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

header button:hover {
  background: #0044ff;
}

.hidden {
  display: none;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid #ddd;
  overflow-y: auto;
  background: #f9f9f9;
}

main {
  flex: 1;
  padding: 1rem;
  overflow: auto;
}
</style>
