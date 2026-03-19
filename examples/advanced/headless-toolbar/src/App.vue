<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import {
  createHeadlessToolbar,
  type HeadlessToolbarController,
  type ToolbarSnapshot,
} from 'superdoc/headless-toolbar';
import HeadlessToolbarDemo from './components/HeadlessToolbarDemo.vue';
import 'superdoc/style.css';

const editorContainer = ref<HTMLDivElement | null>(null);
const snapshot = shallowRef<ToolbarSnapshot>({
  context: null,
  commands: {},
});

const headlessToolbarCommands = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'font-family',
  'font-size',
  'text-color',
  'highlight-color',
  'link',
  'linked-style',
  'table-insert',
  'table-add-row-before',
  'table-add-row-after',
  'table-delete-row',
  'table-add-column-before',
  'table-add-column-after',
  'table-delete-column',
  'table-delete',
  'table-merge-cells',
  'table-split-cell',
  'table-remove-borders',
  'table-fix',
  'bullet-list',
  'numbered-list',
  'indent-increase',
  'indent-decrease',
  'clear-formatting',
  'copy-format',
  'track-changes-accept-selection',
  'track-changes-reject-selection',
  'image',
  'ruler',
  'zoom',
  'document-mode',
  'undo',
  'redo',
  'text-align',
  'line-height',
] as const;

let superdoc: SuperDoc | null = null;
let unsubscribeToolbar: (() => void) | null = null;
let toolbarController: HeadlessToolbarController | null = null;

const init = () => {
  if (!editorContainer.value) return;

  superdoc = new SuperDoc({
    selector: editorContainer.value,
    document: '/test_file.docx',
    toolbar: null,
  });
  window.superdoc = superdoc;

  toolbarController = createHeadlessToolbar({
    superdoc,
    commands: [...headlessToolbarCommands],
  });

  snapshot.value = toolbarController.getSnapshot();
  unsubscribeToolbar = toolbarController.subscribe(({ snapshot: nextSnapshot }) => {
    snapshot.value = nextSnapshot;
    console.debug('Snapshot:', { snapshot: nextSnapshot });
  });
};

onMounted(() => {
  init();
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
      <HeadlessToolbarDemo :snapshot="snapshot" :toolbar-controller="toolbarController" />
      <div ref="editorContainer" class="editor-host"></div>
    </main>
  </div>
</template>
