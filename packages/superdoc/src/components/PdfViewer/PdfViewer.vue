<script setup>
import { NSpin } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { onMounted, onUnmounted, ref } from 'vue';
import { useSuperdocStore } from '@superdoc/stores/superdoc-store';
import { PDFAdapterFactory, createPDFConfig } from './pdf/pdf-adapter.js';
import { readFileAsArrayBuffer } from './helpers/read-file.js';
import useSelection from '@superdoc/helpers/use-selection';
import './pdf/pdf-viewer.css';

const emit = defineEmits(['page-loaded', 'page-ready', 'ready', 'selection-change', 'bypass-selection']);

const props = defineProps({
  documentData: {
    type: Object,
    required: true,
  },
  config: {
    type: Object,
    required: true,
  },
});

const superdocStore = useSuperdocStore();
const { activeZoom } = storeToRefs(superdocStore);

const viewer = ref(null);
const isReady = ref(false);

const id = props.documentData.id;
const pdfData = props.documentData.data;

const pdfConfig = createPDFConfig({
  pdfLib: props.config.pdfLib,
  pdfViewer: props.config.pdfViewer,
  workerSrc: props.config.workerSrc,
  setWorker: props.config.setWorker,
  textLayerMode: props.config.textLayerMode,
});
const pdfAdapter = PDFAdapterFactory.create(pdfConfig);

const loadPDF = async (file) => {
  try {
    const result = await readFileAsArrayBuffer(file);
    const document = await pdfAdapter.getDocument(result);
    await pdfAdapter.renderPages({
      documentId: id,
      pdfDocument: document,
      viewerContainer: viewer.value,
      emit,
    });
    isReady.value = true;
  } catch {}
};

function getSelectedTextBoundingBox(container) {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const boundingRects = range.getClientRects();

  if (boundingRects.length === 0) {
    return null;
  }

  // Initialize bounding box with the first bounding rectangle
  const firstRect = boundingRects[0];
  let boundingBox = {
    top: firstRect.top,
    left: firstRect.left,
    bottom: firstRect.bottom,
    right: firstRect.right,
  };

  for (let i = 1; i < boundingRects.length; i++) {
    const rect = boundingRects[i];
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }
    boundingBox.top = Math.min(boundingBox.top, rect.top);
    boundingBox.left = Math.min(boundingBox.left, rect.left);
    boundingBox.bottom = Math.max(boundingBox.bottom, rect.bottom);
    boundingBox.right = Math.max(boundingBox.right, rect.right);
  }

  // Get the bounding box of the container
  const containerRect = container.getBoundingClientRect();
  const viewerRect = viewer.value.getBoundingClientRect();

  // Adjust the bounding box relative to the page
  boundingBox.top = (boundingBox.top - containerRect.top) / (activeZoom.value / 100) + container.scrollTop;
  boundingBox.left = (boundingBox.left - containerRect.left) / (activeZoom.value / 100) + container.scrollLeft;
  boundingBox.bottom = (boundingBox.bottom - containerRect.top) / (activeZoom.value / 100) + container.scrollTop;
  boundingBox.right = (boundingBox.right - containerRect.left) / (activeZoom.value / 100) + container.scrollLeft;

  return boundingBox;
}

const handlePdfClick = (e) => {
  const { target } = e;
  if (target.tagName !== 'SPAN') {
    emit('bypass-selection', e);
  }
};

const handleMouseUp = (e) => {
  const selection = window.getSelection();
  if (selection.toString().length > 0) {
    const selectionBounds = getSelectedTextBoundingBox(viewer.value);
    const sel = useSelection({
      selectionBounds,
      documentId: id,
    });
    emit('selection-change', sel);
  }
};

onMounted(async () => {
  await loadPDF(pdfData);
});

onUnmounted(() => {
  pdfAdapter.destroy();
});
</script>

<template>
  <div class="superdoc-pdf-viewer-container" @mousedown="handlePdfClick" @mouseup="handleMouseUp">
    <div class="superdoc-pdf-viewer" ref="viewer" id="viewerId"></div>

    <div v-if="!isReady" class="superdoc-pdf-viewer__loader">
      <n-spin class="superdoc-pdf-viewer__spin" size="large" />
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.superdoc-pdf-viewer-container {
  width: 100%;
}

.superdoc-pdf-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
}

.superdoc-pdf-viewer__loader {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-width: 150px;
  min-height: 150px;
}

.superdoc-pdf-viewer__loader :deep(.n-spin) {
  --n-color: #1354ff !important;
  --n-text-color: #1354ff !important;
}

.superdoc-pdf-viewer :deep(.pdf-page) {
  border-top: 1px solid #dfdfdf;
  border-bottom: 1px solid #dfdfdf;
  margin: 0 0 20px 0;
  position: relative;
  overflow: hidden;
}

.superdoc-pdf-viewer :deep(.pdf-page):first-child {
  border-radius: 16px 16px 0 0;
  border-top: none;
}

.superdoc-pdf-viewer :deep(.pdf-page):last-child {
  border-radius: 0 0 16px 16px;
  border-bottom: none;
}

.superdoc-pdf-viewer :deep(.textLayer) {
  z-index: 2;
  position: absolute;
}

.superdoc-pdf-viewer :deep(.textLayer)::selection {
  background-color: #1355ff66;
  mix-blend-mode: difference;
}
</style>
