<script setup lang="ts">
import '@harbour-enterprises/super-editor/style.css';
import { Editor } from '@superdoc';
import { onBeforeUnmount, onMounted, shallowRef, ref, watch } from 'vue';
import type { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { getRichTextExtensions } from '@extensions/index.js';

const props = defineProps<{
  createNode: (schema: Schema) => void;
}>();

const containerElement = ref();
const editor = shallowRef(null);

function initEditor() {
  editor.value = new Editor({
    mode: 'text',
    element: containerElement.value,
  });
}

function updateNode() {
  const schema = editor.value.schema;
  const node = props.createNode(schema);
  const doc = schema.nodes.doc.create(null, [node]);
  const nextState = EditorState.create({ schema, doc, plugins: editor.value.state.plugins });
  editor.value.view.updateState(nextState);
}

function destroyEditor() {
  editor.value?.destroy();
}

onMounted(() => {
  initEditor();
  updateNode();
});

watch(
  () => props.createNode,
  () => {
    updateNode();
  },
);

onBeforeUnmount(() => {
  destroyEditor();
});
</script>

<template>
  <div class="super-editor" ref="containerElement"></div>
</template>

<style scoped>
.sd-editor-scoped {
  width: initial !important;
  min-width: initial !important;
  min-height: initial !important;
  padding: initial !important;
}
</style>
