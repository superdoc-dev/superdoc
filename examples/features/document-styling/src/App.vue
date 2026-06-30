<style>

/*
 * Page shadow - uniform on all sides, similar to Microsoft Word
 *
 * The default SuperDoc shadow is bottom-only. This changes it to a uniform
 * shadow on all sides for a more Word-like appearance.
 */
.superdoc-page {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.15) !important;
  border: 1px solid #d4d4d4 !important;
}

/*
 * Shadow visibility
 *
 * By default, the viewport width is calculated to exactly fit the page width.
 * This clips horizontal shadows. Setting overflow: visible on these containers
 * allows the shadow to render outside the layout bounds.
 *
 */
.superdoc-layout,
.presentation-editor__viewport,
.super-editor {
  overflow: visible !important;
}

/*
 * Font rendering - subpixel antialiasing for crisp text
 *
 * Improves text clarity, especially on high-DPI displays.
 */
.superdoc-layout {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
  -moz-osx-font-smoothing: auto;
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

/* Gray background matching Word's default appearance */
.editor-wrapper {
  flex: 1;
  overflow: auto;
  background-color: #dedede;
  display: flex;
  justify-content: center;
  padding-top: 24px;
}
</style>

<template>
  <div class="app">
    <div id="toolbar"></div>
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
    modules: {
      toolbar: {
        selector: 'toolbar',
      },
    },
  });
};

onMounted(async () => {
  await loadDefaultDocument();
  initEditor();
});

watch(file, initEditor);
</script>
