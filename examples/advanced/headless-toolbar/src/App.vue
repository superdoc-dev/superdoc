<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import { createHeadlessToolbar, type ToolbarSnapshot } from 'superdoc/headless-toolbar';
import 'superdoc/style.css';

const editorContainer = ref<HTMLDivElement | null>(null);
const snapshot = shallowRef<ToolbarSnapshot>({
  context: null,
  commands: {
    toggleBold: { active: false, disabled: true },
    toggleItalic: { active: false, disabled: true },
  },
});

let superdoc: SuperDoc | null = null;
let unsubscribeToolbar: (() => void) | null = null;
let toolbarController: { destroy(): void; getSnapshot(): ToolbarSnapshot } | null = null;

const handleBoldClick = () => {
  snapshot.value.context?.editor?.commands?.toggleBold?.();
};

const handleItalicClick = () => {
  snapshot.value.context?.editor?.commands?.toggleItalic?.();
};

onMounted(() => {
  if (!editorContainer.value) return;

  superdoc = new SuperDoc({
    selector: editorContainer.value,
    toolbar: null,
  });
  window.superdoc = superdoc;

  toolbarController = createHeadlessToolbar({
    superdoc,
    commands: ['toggleBold', 'toggleItalic'],
  });

  snapshot.value = toolbarController.getSnapshot();
  unsubscribeToolbar = toolbarController.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot;
  });
});

onBeforeUnmount(() => {
  unsubscribeToolbar?.();
  toolbarController?.destroy?.();
  superdoc?.destroy?.();
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Advanced Example</p>
        <h1>Headless Toolbar</h1>
      </div>
      <p class="intro">
        This toolbar is fully customer-owned UI. SuperDoc only provides headless state and command access.
      </p>
    </header>

    <main class="workspace">
      <div class="toolbar-floating">
        <button
          class="toolbar-button"
          :class="{ 'toolbar-button-active': snapshot.commands.toggleBold?.active }"
          :disabled="snapshot.commands.toggleBold?.disabled"
          type="button"
          @click="handleBoldClick"
        >
          Bold
        </button>
        <button
          class="toolbar-button"
          :class="{ 'toolbar-button-active': snapshot.commands.toggleItalic?.active }"
          :disabled="snapshot.commands.toggleItalic?.disabled"
          type="button"
          @click="handleItalicClick"
        >
          Italic
        </button>
        <div class="toolbar-meta">
          <span>Surface: {{ snapshot.context?.surface ?? 'none' }}</span>
          <span>Editable: {{ snapshot.context?.isEditable ? 'yes' : 'no' }}</span>
          <span>Selection empty: {{ snapshot.context?.selectionEmpty ? 'yes' : 'no' }}</span>
        </div>
      </div>

      <div ref="editorContainer" class="editor-host"></div>
    </main>
  </div>
</template>
