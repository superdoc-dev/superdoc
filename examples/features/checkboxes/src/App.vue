<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

import blankDocUrl from '/default.docx?url';

const file = ref<File | null>(null);
const isLoading = ref(true);
const containerEl = ref<HTMLDivElement | null>(null);
let superdoc: any = null;
// Prevents repeated toggling when selectionUpdate fires multiple times for the same checkbox
let lastCheckboxId: string | null = null;

const checkboxIcon = `<svg viewBox="60 60 520 520" fill="currentColor"><path d="M480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 160C96 124.7 124.7 96 160 96L480 96zM160 144C151.2 144 144 151.2 144 160L144 480C144 488.8 151.2 496 160 496L480 496C488.8 496 496 488.8 496 480L496 160C496 151.2 488.8 144 480 144L160 144zM390.7 233.9C398.5 223.2 413.5 220.8 424.2 228.6C434.9 236.4 437.3 251.4 429.5 262.1L307.4 430.1C303.3 435.8 296.9 439.4 289.9 439.9C282.9 440.4 276 437.9 271.1 433L215.2 377.1C205.8 367.7 205.8 352.5 215.2 343.2C224.6 333.9 239.8 333.8 249.1 343.2L285.1 379.2L390.7 234z" stroke="currentColor" stroke-width="24"/></svg>`;

const insertCheckbox = async () => {
  const editor = superdoc?.activeEditor;
  if (!editor) return;

  const result = await editor.doc.create.contentControl({
    kind: 'inline',
    controlType: 'checkbox',
    tag: `checkbox-${Date.now()}`,
  });

  if (result.success) {
    editor.commands.insertContent(' ');
    editor.commands.focus?.();
  }
};

const setupClickToToggle = () => {
  const editor = superdoc?.activeEditor;
  if (!editor) return;

  editor.on('selectionUpdate', async ({ editor: ed }: any) => {
    const { $from } = ed.state.selection;

    // Find if we're inside a checkbox
    let checkboxId: string | null = null;
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (
        (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') &&
        node.attrs?.controlType === 'checkbox'
      ) {
        checkboxId = node.attrs?.id;
        break;
      }
    }

    if (!checkboxId || checkboxId === lastCheckboxId) {
      if (!checkboxId) lastCheckboxId = null;
      return;
    }

    lastCheckboxId = checkboxId;

    // Find and toggle the checkbox
    const allControls = ed.doc.contentControls.list();
    const checkbox = allControls.items.find(
      (item: any) => item.id === checkboxId || item.target?.nodeId === checkboxId
    );

    if (checkbox) {
      await ed.doc.contentControls.checkbox.toggle({ target: checkbox.target });
    }
  });
};

const exportDocument = async () => {
  if (!superdoc) return;

  const blob = await superdoc.export({ format: 'docx' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'document-with-checkboxes.docx';
  a.click();
  URL.revokeObjectURL(url);
};

watch(file, async (newFile) => {
  if (!newFile || !containerEl.value) return;

  superdoc?.destroy();

  superdoc = new SuperDoc({
    selector: containerEl.value,
    document: newFile,
    toolbar: '#toolbar',
    documentMode: 'editing',
    modules: {
      toolbar: {
        customButtons: [
          {
            type: 'button',
            name: 'insertCheckbox',
            tooltip: 'Insert Checkbox',
            icon: checkboxIcon,
            group: 'center',
            command: insertCheckbox,
          },
        ],
      },
    },
    onReady: () => {
      setTimeout(setupClickToToggle, 500);
    },
  });
});

onMounted(async () => {
  try {
    const response = await fetch(blankDocUrl);
    const blob = await response.blob();
    file.value = new File([blob], 'default.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  } finally {
    isLoading.value = false;
  }
});

onUnmounted(() => {
  superdoc?.destroy();
  superdoc = null;
});
</script>

<template>
  <div class="app">
    <header class="header">
      <input
        type="file"
        accept=".docx"
        @change="(e) => file = (e.target as HTMLInputElement).files?.[0] ?? null"
      />
      <button @click="exportDocument" :disabled="!file || isLoading">Export DOCX</button>
    </header>

    <div id="toolbar"></div>

    <div class="main">
      <div v-if="isLoading" class="loading">Loading...</div>
      <div v-show="!isLoading" ref="containerEl" class="editor"></div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  padding: 0.75rem 1rem;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.main {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
}

.editor {
  width: 100%;
  max-width: 900px;
}

.loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
}
</style>
