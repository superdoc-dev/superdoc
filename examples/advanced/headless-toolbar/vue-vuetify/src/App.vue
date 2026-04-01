<script setup lang="ts">
import { ref, onMounted, onUnmounted, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import {
  createHeadlessToolbar,
  type HeadlessToolbarController,
  type ToolbarSnapshot,
} from 'superdoc/headless-toolbar';
import 'superdoc/style.css';
import Toolbar from './Toolbar.vue';

const editorRef = ref<HTMLElement | null>(null);
let superdoc: InstanceType<typeof SuperDoc> | null = null;
let toolbar: HeadlessToolbarController | null = null;

const snapshot = shallowRef<ToolbarSnapshot>({ context: null, commands: {} });

function execute(id: string, payload?: unknown) {
  toolbar?.execute(id as any, payload);
}

onMounted(() => {
  if (!editorRef.value) return;

  superdoc = new SuperDoc({
    selector: editorRef.value,
    document: '/test_file.docx',
  });

  toolbar = createHeadlessToolbar({
    superdoc: superdoc as any,
    commands: [
      'bold', 'italic', 'underline', 'strikethrough',
      'font-family', 'font-size', 'text-color',
      'text-align', 'line-height',
      'bullet-list', 'numbered-list',
      'indent-increase', 'indent-decrease',
      'undo', 'redo', 'zoom', 'image',
      'clear-formatting',
    ],
  });

  snapshot.value = toolbar.getSnapshot();
  toolbar.subscribe(({ snapshot: s }) => {
    snapshot.value = s;
  });
});

onUnmounted(() => {
  toolbar?.destroy();
  superdoc?.destroy();
});
</script>

<template>
  <v-app>
    <Toolbar :snapshot="snapshot" @execute="execute" />
    <v-main>
      <div ref="editorRef" class="editor-container" />
    </v-main>
  </v-app>
</template>

<style>
html, body, #app {
  margin: 0;
  height: 100%;
}

.v-application {
  height: 100%;
}

.v-main {
  height: 100%;
  overflow: auto;
}

.editor-container {
  height: 100%;
}
</style>
