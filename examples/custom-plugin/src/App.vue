<script setup>
import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { customPluginExtension } from './custom-plugin-extension';

const superdoc = shallowRef(null);
const activeBlock = shallowRef(null);
const fileInputRef = ref(null);
let removeActiveBlockListener = null;
const highlightClass = 'custom-plugin-highlight';
const nonTextHighlightClass = `${highlightClass}--non-text`;

let highlightedElement = null;

// Pause the internal ProseMirror DOM observer while we tweak classes so the
// editor does not echo our changes back into transactions.
const withObserverPaused = (view, fn) => {
  if (!view || view.isDestroyed) {
    fn();
    return;
  }

  const observer = view.domObserver;
  if (!observer || typeof observer.stop !== 'function' || typeof observer.start !== 'function') {
    fn();
    return;
  }

  observer.stop();
  try {
    fn();
  } finally {
    observer.start();
  }
};

// Remove highlight classes from the previously active block, if any.
const clearHighlight = (view) => {
  if (!highlightedElement) {
    return;
  }

  withObserverPaused(view, () => {
    highlightedElement?.classList.remove(highlightClass);
    highlightedElement?.classList.remove(nonTextHighlightClass);
  });

  highlightedElement = null;
};

// Apply highlight classes to the DOM node associated with the active block.
const applyHighlight = (view, blockInfo) => {
  if (!view) {
    clearHighlight(view);
    return;
  }

  if (!blockInfo) {
    clearHighlight(view);
    return;
  }

  const domNode = view.nodeDOM(blockInfo.pos);
  const element =
    typeof Element !== 'undefined' && domNode instanceof Element
      ? domNode
      : domNode?.parentElement ?? null;

  if (!element) {
    clearHighlight(view);
    return;
  }

  if (highlightedElement !== element) {
    clearHighlight(view);
    highlightedElement = element;
  }

  if (!highlightedElement) {
    return;
  }

  withObserverPaused(view, () => {
    highlightedElement?.classList.add(highlightClass);

    if (!blockInfo.isTextblock) {
      highlightedElement?.classList.add(nonTextHighlightClass);
    } else {
      highlightedElement?.classList.remove(nonTextHighlightClass);
    }
  });
};

const teardownEditor = () => {
  removeActiveBlockListener?.();
  removeActiveBlockListener = null;
  const editorView = superdoc.value?.activeEditor?.view;
  clearHighlight(editorView);
  superdoc.value?.destroy();
  superdoc.value = null;
};

const initializeEditor = (docToLoad) => {
  teardownEditor();
  activeBlock.value = null;

  const config = {
    selector: '#editor',
    toolbar: '#toolbar',
    documentMode: 'editing',
    pagination: true,
    rulers: false,
    toolbarGroups: ['center'],
    editorExtensions: [customPluginExtension],
    onReady: () => {
      const editorInstance = superdoc.value?.activeEditor;
      if (!editorInstance) {
        return;
      }

      const handleActiveBlock = (info) => {
        activeBlock.value = info;
      };

      editorInstance.on('custom-plugin:active-block', handleActiveBlock);
      removeActiveBlockListener = () => {
        editorInstance.off('custom-plugin:active-block', handleActiveBlock);
      };
    },
  };

  if (docToLoad) {
    config.document = docToLoad;
  }

  superdoc.value = new SuperDoc(config);
};

const triggerFilePicker = () => {
  fileInputRef.value?.click();
};

const handleFileChange = (event) => {
  const [file] = event.target.files || [];
  if (file) {
    initializeEditor(file);
  }

  event.target.value = '';
};

const resetDocument = () => {
  initializeEditor();
};

onMounted(() => {
  initializeEditor();
});

onBeforeUnmount(() => {
  teardownEditor();
});

// Mirror plugin metadata into DOM classes so non-technical readers can see the
// block highlight without digging into ProseMirror internals.
watch(activeBlock, (info) => {
  const editorView = superdoc.value?.activeEditor?.view;
  applyHighlight(editorView, info);
});
</script>

<template>
  <div class="example-shell">
    <header class="hero">
      <div class="hero__badge">SuperDoc Example</div>
      <h1>SuperDoc + Custom Plugins</h1>
      <p>
        Register a custom SuperDoc extension, and inject your own ProseMirror
        plugins. This demo highlights the block that contains the current selection and surfaces its metadata.
      </p>
      <div class="hero__actions">
        <button type="button" class="action-button action-button--primary" @click="triggerFilePicker">
          Import DOCX
        </button>
        <button type="button" class="action-button action-button--ghost" @click="resetDocument">
          Reset Document
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".docx"
          class="sr-only"
          @change="handleFileChange"
        />
      </div>
    </header>

    <div class="workspace">
      <div id="toolbar" class="toolbar"></div>
      <div id="editor" class="editor"></div>
    </div>

    <p class="hint" v-if="activeBlock">
      Active block starts at <code>{{ activeBlock.pos }}</code> —
      <span v-if="activeBlock.textPreview">“{{ activeBlock.textPreview }}”</span>
      <span v-else>Empty block</span>
    </p>
    <p class="hint" v-else>
      Click inside the editor to see which block is active. The highlighted outline comes from the custom plugin.
    </p>
  </div>
</template>
