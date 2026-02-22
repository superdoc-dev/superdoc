<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { SuperDoc } from 'superdoc';

const props = defineProps<{
  document?: string | File | Blob;
  user?: { name: string; email: string; image?: string | null };
}>();

const emit = defineEmits(['ready', 'update']);

const editor = ref<HTMLDivElement | null>(null);
let superdoc: SuperDoc | null = null;

onMounted(() => {
  superdoc = new SuperDoc({
    selector: editor.value!,
    documentMode: 'editing',
    document: props.document,
    user: props.user,
    onReady: () => emit('ready'),
    onEditorUpdate: () => emit('update'),
    modules: {
      toolbar: { selector: '#toolbar' },
      comments: { allowResolve: true },
      contextMenu: { includeDefaultItems: true }
    }
  });
});

const setMode = (mode: 'editing' | 'suggesting' | 'viewing') => superdoc?.setDocumentMode(mode);

const exportFinal = async () => {
  await superdoc?.export({ isFinalDoc: true });
};
</script>

<template>
  <div>
    <div class="controls">
      <button @click="setMode('editing')">Edit</button>
      <button @click="setMode('suggesting')">Review</button>
      <button @click="setMode('viewing')">View</button>
      <button @click="exportFinal">Export Final</button>
    </div>
    <div id="toolbar"></div>
    <div ref="editor" class="editor-container" />
  </div>
</template>

<style scoped>
.editor-container {
  height: 700px;
  border: 1px solid #e2e8f0;
  overflow: auto;
}
.controls {
  padding: 1rem;
  display: flex;
  gap: 0.5rem;
}
</style>
