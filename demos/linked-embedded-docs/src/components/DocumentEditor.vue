<template>
  <div class="document-editor">
    <div class="editor-container">
      <div :id="toolbarId" class="toolbar"></div>
      <div :id="editorId" class="editor"></div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, shallowRef, watch, computed } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const props = defineProps({
  editorId: {
    type: String,
    default: 'superdoc'
  },
  initialData: {
    type: [File, Blob, String],
    default: null
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  contained: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['editor-ready', 'editor-error', 'superdoc-ready']);

const toolbarId = computed(() => `${props.editorId}-toolbar`);

let superdocInstance = null;
const isInitialized = shallowRef(false);

const destroyEditor = () => {
  if (superdocInstance) {
    try {
      superdocInstance.destroy();
    } catch (e) {
      console.warn('Error destroying editor:', e);
    }
    superdocInstance = null;
    isInitialized.value = false;
  }
};

const initializeEditor = async () => {
  if (!props.initialData) {
    return;
  }

  try {
    destroyEditor();
    await nextTick();

    superdocInstance = new SuperDoc({
      selector: `#${props.editorId}`,
      toolbar: `#${toolbarId.value}`,
      document: props.initialData,
      documentMode: props.readOnly ? 'viewing' : 'editing',
      pagination: true,
      rulers: false,
      ...(props.contained && { contained: true }),
    });

    isInitialized.value = true;
    emit('superdoc-ready', superdocInstance);

    superdocInstance.on('editorCreate', ({ editor: innerEditor }) => {
      console.log(`Editor ${props.editorId} is ready`);
      emit('editor-ready', innerEditor);
    });
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    emit('editor-error', error);
  }
};

watch(
  () => [props.initialData, props.readOnly],
  () => {
    void initializeEditor();
  }
);

onMounted(() => {
  void initializeEditor();
});

onUnmounted(() => {
  destroyEditor();
});
</script>

<style scoped>
.document-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  min-height: 200px;
}
</style>
