import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, markRaw } from 'vue';
import { PDF } from '@superdoc/common';

export const useWhiteboard = ({ proxy, layers, documents, modules }) => {
  // Resolve module config (false disables whiteboard module).
  const whiteboardModuleConfig = computed(() => {
    const config = modules.value?.whiteboard ?? modules.whiteboard;
    if (config === false || config == null) return null;
    return config;
  });

  const whiteboard = proxy?.$superdoc?.whiteboard;

  // NOTE: whiteboardPages holds class instances; keep them raw to avoid Vue proxying.
  const whiteboardPages = shallowRef([]);
  const whiteboardPageSizes = reactive({});
  const whiteboardPageOffsets = reactive({});

  const whiteboardOpacity = ref(1);
  const whiteboardEnabled = ref(whiteboardModuleConfig.value?.enabled ?? false);

  // Sync page size + instances when PDF viewer reports page-ready.
  const handleWhiteboardPageReady = (payload) => {
    if (!payload) return;
    const doc = documents.value?.[0];
    if (!doc) return;
    if (doc.type === PDF) {
      handleWhiteboardPDFPageReady(payload);
    }
  };

  const handleWhiteboardPDFPageReady = (payload) => {
    const { pageIndex, width, height, originalWidth, originalHeight } = payload;
    const size = { width, height, originalWidth, originalHeight };
    whiteboard?.setPageSize(pageIndex, size);
    whiteboardPageSizes[pageIndex] = size;
    const existingPage = whiteboard?.getPage(pageIndex);
    if (existingPage) {
      existingPage.setSize(size);
    }
    if (whiteboard) {
      whiteboardPages.value = whiteboard
        .getPages()
        .sort((a, b) => a.pageIndex - b.pageIndex)
        .map((page) => markRaw(page));
    }
    nextTick(() => updateWhiteboardPageOffsets());
  };

  // Re-emit for host app consumers.
  const handleWhiteboardChange = (data) => {
    proxy?.$superdoc?.emit('whiteboard:change', data);
    console.debug('[Whiteboard] change', data);
  };

  // Update UI pages after setWhiteboardData.
  const handleWhiteboardSetData = (pages) => {
    pages.forEach((page) => {
      const size = whiteboardPageSizes[page.pageIndex];
      if (size) page.setSize(size);
    });
    whiteboardPages.value = pages.map((page) => markRaw(page));
    nextTick(() => updateWhiteboardPageOffsets());
  };

  const handleWhiteboardEnabled = (enabled) => {
    whiteboardEnabled.value = enabled;
    proxy?.$superdoc?.emit('whiteboard:enabled', enabled);
  };

  const handleWhiteboardOpacity = (opacity) => {
    whiteboardOpacity.value = opacity;
  };

  const handleWhiteboardTool = (tool) => {
    proxy?.$superdoc?.emit('whiteboard:tool', tool);
  };

  // Recompute page sizes (used for PDF zoom changes).
  const updateWhiteboardPageSizes = () => {
    const doc = documents.value?.[0];
    if (!doc) return;
    if (doc.type === PDF) {
      updateWhiteboardPDFPageSizes({ doc });
    }
  };

  const updateWhiteboardPDFPageSizes = ({ doc }) => {
    whiteboardPages.value.forEach((page) => {
      const pageEl = document.getElementById(`${doc.id}-page-${page.pageIndex + 1}`);
      if (!pageEl) return;
      const pageBounds = pageEl.getBoundingClientRect();
      const existingSize = whiteboardPageSizes[page.pageIndex] || {};
      const originalWidth = existingSize.originalWidth ?? page.size?.originalWidth ?? pageBounds.width;
      const originalHeight = existingSize.originalHeight ?? page.size?.originalHeight ?? pageBounds.height;
      const size = {
        width: pageBounds.width,
        height: pageBounds.height,
        originalWidth,
        originalHeight,
      };
      whiteboardPageSizes[page.pageIndex] = size;
      page.setSize(size);
    });
  };

  // Recompute offsets for overlay positioning.
  // NOTE: Coordinates are currently absolute (not normalized to page size).
  const updateWhiteboardPageOffsets = () => {
    const layerBounds = layers.value?.getBoundingClientRect?.();
    if (!layerBounds) return;
    const doc = documents.value?.[0];
    if (!doc) return;
    if (doc.type === PDF) {
      updateWhiteboardPDFPageOffsets({ doc, layerBounds });
    }
  };

  const updateWhiteboardPDFPageOffsets = ({ doc, layerBounds }) => {
    whiteboardPages.value.forEach((page) => {
      const pageEl = document.getElementById(`${doc.id}-page-${page.pageIndex + 1}`);
      if (!pageEl) return;
      const pageBounds = pageEl.getBoundingClientRect();
      whiteboardPageOffsets[page.pageIndex] = {
        top: pageBounds.top - layerBounds.top,
        left: pageBounds.left - layerBounds.left,
      };
    });
  };

  if (whiteboard) {
    whiteboard.on('change', handleWhiteboardChange);
    whiteboard.on('setData', handleWhiteboardSetData);
    whiteboard.on('enabled', handleWhiteboardEnabled);
    whiteboard.on('opacity', handleWhiteboardOpacity);
    whiteboard.on('tool', handleWhiteboardTool);
  }

  onBeforeUnmount(() => {
    if (!whiteboard) return;
    whiteboard.off('change', handleWhiteboardChange);
    whiteboard.off('setData', handleWhiteboardSetData);
    whiteboard.off('opacity', handleWhiteboardOpacity);
    whiteboard.off('enabled', handleWhiteboardEnabled);
    whiteboard.off('tool', handleWhiteboardTool);
  });

  return {
    whiteboard,
    whiteboardModuleConfig,
    whiteboardPages,
    whiteboardPageSizes,
    whiteboardPageOffsets,
    whiteboardEnabled,
    whiteboardOpacity,
    handleWhiteboardPageReady,
    updateWhiteboardPageSizes,
    updateWhiteboardPageOffsets,
  };
};
