<template>
  <div class="document-editor">
    <div :key="documentKey" class="editor-container">
      <div id="superdoc-toolbar" class="toolbar"></div>
      <div id="superdoc" class="editor"></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const props = defineProps({
  initialData: {
    type: [File, Blob],
    default: null
  },
  readOnly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['editor-ready', 'editor-error']);

let superdocInstance = null;
const documentKey = ref(0);

const destroyEditor = () => {
  if (superdocInstance) {
    superdocInstance = null;
  }
};

const initializeEditor = async () => {
  try {
    destroyEditor();
    documentKey.value++;

    superdocInstance = new SuperDoc({
      selector: '#superdoc',
      toolbar: '#superdoc-toolbar',
      document: props.initialData,
      documentMode: props.readOnly ? 'viewing' : 'editing',
      pagination: true,
      rulers: true,
      onReady: ({ superdoc }) => {
        emit('editor-ready', superdoc);
      },
    });
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    emit('editor-error', error);
  }
};

watch(
  () => [props.initialData, props.readOnly],
  () => {
    initializeEditor();
  }
);

onMounted(() => {
  initializeEditor();
});

onUnmounted(() => {
  destroyEditor();
});

defineExpose({
  getSuperdoc: () => superdocInstance
});
</script>

<style scoped>
.document-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.toolbar {
  flex: 0 0 auto;
  border-bottom: 1px solid #eee;
  min-height: 40px;
}

.editor {
  display: flex;
  justify-content: center;
  flex: 1 1 auto;
  overflow: auto;
  margin-top: 10px;
  min-height: 400px;
}
</style>
