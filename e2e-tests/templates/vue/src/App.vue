<script setup>
import 'superdoc/style.css';
import BlankDOCX from './data/blank.docx?url';
import { onMounted, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';

import { CustomMark } from './custom-mark.js';
import { nextTick } from 'vue';

window.fileData = null;
const urlParams = new URLSearchParams(window.location.search);
const useLayoutEngine = urlParams.get('layout') === '1';
const superdoc = shallowRef(null);
const hideRulerByDefault = true;

const hideRulerIfNeeded = () => {
  if (!hideRulerByDefault) return;
  const instance = superdoc.value;
  if (!instance?.config?.rulers) return;
  instance.toggleRuler();
  instance.toolbar?.updateToolbarState();
};

const init = async () => {
  if (superdoc.value) superdoc.value.destroy();

  const config = {
    selector: '#editor',
    pagination: useLayoutEngine,
    useLayoutEngine,
    toolbar: '#toolbar',
    toolbarGroups: ['center'],
    rulers: true, // keep the toolbar button rendered; visibility is toggled separately
    onReady,
    onTransaction,
  };

  // Get query params to determine if this is a toolbar test
  // In such case we want to add a custom button for testing
  const isToolbarTest = urlParams.get('includeCustomButton') === 'true';
  const isFontsTest = urlParams.get('includeFontsResolved') === 'true';
  const isCommentsTest = urlParams.get('includeComments') === 'true';
  const documentMode = urlParams.get('documentMode');
  const commentsVisible = urlParams.get('commentsVisible');
  const trackChangesVisible = urlParams.get('trackChangesVisible');

  if (isToolbarTest) {
    config.editorExtensions = [CustomMark];
    config.modules = {
      toolbar: {
        useLayoutEngine: false,
        selector: '#toolbar',
        toolbarGroups: ['center'],
        customButtons: [
          {
            type: 'button',
            name: 'insertCustomMark',
            command: 'setMyCustomMark',
            tooltip: 'Insert Custom Mark',
            group: 'center',
            icon: '🎧',
          },
        ],
      },
    };
    config.toolbar = null;
  } else {
    config.toolbar = '#toolbar';
    config.toolbarGroups = ['center'];
  }

  if (isFontsTest) {
    config.onFontsResolved = onFontsResolved;
  }

  config.modules = { ...config.modules, comments: isCommentsTest };
  if (documentMode) {
    config.documentMode = documentMode;
  }
  if (commentsVisible === 'true' || commentsVisible === 'false') {
    config.comments = { visible: commentsVisible === 'true' };
  }
  if (trackChangesVisible === 'true' || trackChangesVisible === 'false') {
    config.trackChanges = { visible: trackChangesVisible === 'true' };
  }

  if (superdoc.value) superdoc.value.destroy();

  if (window.fileData) {
    const fileExtension = window.fileData.name.split('.').pop()?.toLowerCase();
    const isHtml = fileExtension === 'html' || fileExtension === 'htm';
    if (isHtml) {
      const fileObj = await getFileObject(
        BlankDOCX,
        'blank.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      const content = await readFileAsText(window.fileData);
      config.document = { data: fileObj, html: content };
    } else {
      config.document = {
        data: new File([window.fileData], 'document.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        type: 'docx',
      };
    }
  }

  nextTick(() => {
    if (!config.modules) config.modules = {};
    superdoc.value = new SuperDoc(config);
  });
};

const onReady = () => {
  superdoc.value.activeEditor.on('create', ({ editor }) => {
    window.editor = editor;
    window.superdoc = superdoc.value;
  });
  hideRulerIfNeeded();
  if (window.superdocReady) {
    window.superdocReady();
  }
};

const handleFileChange = async (event) => {
  const file = event.target.files?.[0];
  if (file) {
    window.fileData = file;
    await init();
  }
};

const getFileObject = async (fileUrl, name, type) => {
  const response = await fetch(fileUrl);
  const blob = await response.blob();
  return new File([blob], name, { type });
};

const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

const onTransaction = ({ duration }) => {
  if (window.onTransaction) {
    window.onTransaction({ duration });
  }
};

const onFontsResolved = ({ documentFonts, unsupportedFonts }) => {
  if (window.onFontsResolved) {
    window.onFontsResolved({ documentFonts, unsupportedFonts });
  }
};

onMounted(() => {
  init();
});
</script>

<template>
  <div class="example-container" :class="{ 'no-layout': !useLayoutEngine }" data-testid="example-container">
    <h1>SuperDoc: Testing template</h1>
    <input type="file" ref="fileInput" accept=".docx,.pdf,.html" @change="handleFileChange" />
    <div id="toolbar" class="my-custom-toolbar"></div>
    <div id="editor" class="main-editor" data-testid="editor"></div>
  </div>
</template>

<style>
button {
  padding: 0.5rem 1rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #0044ff;
}

.hidden {
  display: none;
}

.no-layout .super-editor {
  border: 1px solid #999;
}
</style>
