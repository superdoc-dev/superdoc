<script setup>
import { ref } from 'vue';
import PdfViewerPage from './PdfViewerPage.vue';

const emit = defineEmits(['page-focus', 'page-rendered', 'page-error', 'selection-raw', 'bypass-selection']);

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
  pdf: {
    type: Object,
  },
  pages: {
    type: Array,
    required: true,
  },
  scale: {
    type: Number,
  },
  hasTextLayer: {
    type: Boolean,
    default: false,
  },
  outputScale: {
    type: Number,
  },
});

const documentRef = ref(null);
const documentWrapper = ref(null);

function onPageFocused(pageNumber) {
  emit('page-focus', pageNumber);
}

function onPageRendered(payload) {
  emit('page-rendered', payload);
}

function onPageError(page) {
  emit('page-error', page);
}

function onSelectionRaw(payload) {
  emit('selection-raw', payload);
}

function onBypassSelection(event) {
  emit('bypass-selection', event);
}
</script>

<template>
  <div class="sd-pdf-viewer-document" ref="documentRef">
    <div class="sd-pdf-viewer-document__wrapper" ref="documentWrapper">
      <PdfViewerPage
        v-for="page in pages"
        :key="page.pageId"
        v-bind="{
          page,
          pages,
          scale,
          config,
          hasTextLayer,
          outputScale,
          documentEl: documentRef,
        }"
        @page-rendered="onPageRendered"
        @page-error="onPageError"
        @selection-raw="onSelectionRaw"
        @bypass-selection="onBypassSelection"
      >
      </PdfViewerPage>
    </div>
  </div>
</template>

<style scoped>
.sd-pdf-viewer-document {
  position: relative;
  width: 100%;
}

.sd-pdf-viewer-document__wrapper {
  width: 100%;
  padding-bottom: 10px;
}
</style>
