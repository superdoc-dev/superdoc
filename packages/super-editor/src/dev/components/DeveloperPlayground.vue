<script setup>
import '@superdoc/super-editor/style.css';
import '@superdoc/common/styles/common-styles.css';

import { ref, shallowRef, computed, onMounted } from 'vue';
import { NMessageProvider } from 'naive-ui';
import { SuperEditor } from '@superdoc/super-editor';
import { PresentationEditor } from '@core/presentation-editor/index.js';
import { getFileObject } from '@superdoc/common/helpers/get-file-object';
import { DOCX } from '@superdoc/common';
import { SuperToolbar } from '@components/toolbar/super-toolbar';
import { PaginationPluginKey } from '@extensions/pagination/pagination-helpers.js';
import BasicUpload from './BasicUpload.vue';
import BlankDOCX from '@superdoc/common/data/blank.docx?url';
import { Telemetry } from '@superdoc/common/Telemetry';

// Import the component the same you would in your app
let activeEditor;
const currentFile = ref(null);
const pageStyles = ref(null);
const isDebuggingPagination = ref(false);
const telemetry = shallowRef(null);
const urlParams = new URLSearchParams(window.location.search);
const useLayoutEngine = ref(urlParams.get('layout') === '1');

// Content injection variables
const contentInput = ref('');
const contentType = ref('html');
const isInjectingContent = ref(false);

const handleNewFile = async (file) => {
  currentFile.value = null;
  const fileUrl = URL.createObjectURL(file);
  currentFile.value = await getFileObject(fileUrl, file.name, file.type);
};

const onCreate = ({ editor }) => {
  console.debug('[Dev] Editor created', editor);
  console.debug('[Dev] Page styles (pixels)', editor.getPageStyles());
  console.debug('[Dev] document styles', editor.converter?.getDocumentDefaultStyles());

  pageStyles.value = editor.converter?.pageStyles;
  activeEditor = editor;
  window.editor = editor;

  editor.setToolbar(initToolbar());
  editor.toolbar.on('superdoc-command', ({ item, argument }) => {
    const { command } = item;
    if (command === 'setDocumentMode') {
      editor.setDocumentMode(argument);
    }
  });
  attachAnnotationEventHandlers();

  // Set debugging pagination value from editor plugin state
  isDebuggingPagination.value = useLayoutEngine.value
    ? Boolean(PaginationPluginKey.getState(editor.state)?.isDebugging)
    : false;

  // editor.commands.addFieldAnnotation(0, {
  //   type: 'text',
  //   displayLabel: 'Some text',
  //   fieldId: '123',
  //   fieldType: 'TEXTINPUT',
  //   fieldColor: '#980043',
  // });
};

const onCommentClicked = ({ conversation }) => {
  console.debug('💬 [Dev] Comment active', conversation);
};

const user = {
  name: 'Developer playground',
  email: 'devs@harbourshare.com',
};

const editorOptions = computed(() => {
  return {
    documentId: 'dev-123',
    user,
    rulers: true,
    onCreate,
    onCommentClicked,
    onCommentsLoaded,
    suppressSkeletonLoader: true,
    users: [], // For comment @-mentions, only users that have access to the document
    pagination: useLayoutEngine.value,
    telemetry: telemetry.value,
    annotations: true,
    editorCtor: useLayoutEngine.value ? PresentationEditor : undefined,
  };
});

const onCommentsLoaded = ({ comments }) => {
  console.debug('💬 [Dev] Comments loaded', comments);
};

const exportDocx = async () => {
  const result = await activeEditor?.exportDocx();
  const blob = new Blob([result], { type: DOCX });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported.docx';
  a.click();
};

const attachAnnotationEventHandlers = () => {
  activeEditor?.on('fieldAnnotationClicked', (params) => {
    console.log('fieldAnnotationClicked', { params });
  });

  activeEditor?.on('fieldAnnotationSelected', (params) => {
    console.log('fieldAnnotationSelected', { params });
  });

  activeEditor?.on('fieldAnnotationDeleted', (params) => {
    console.log('fieldAnnotationDeleted', { params });
  });
};

const initToolbar = () => {
  return new SuperToolbar({ element: 'toolbar', editor: activeEditor, isDev: true, pagination: true });
};

/* For pagination debugging / visual cues */
const debugPageStyle = computed(() => {
  return {
    height: pageStyles.value?.pageSize.height + 'in',
  };
});

const injectContent = () => {
  if (!activeEditor || !contentInput.value.trim()) {
    console.warn('[Dev] No editor instance or empty content');
    return;
  }

  try {
    isInjectingContent.value = true;

    // Delegate processing to the insertContent command
    activeEditor.commands.insertContent(contentInput.value, {
      contentType: contentType.value, // 'html', 'markdown', or 'text'
    });

    console.debug(`[Dev] ${contentType.value} content injected successfully`);
    contentInput.value = '';
  } catch (error) {
    console.error('[Dev] Failed to inject content:', error);
  } finally {
    isInjectingContent.value = false;
  }
};

onMounted(async () => {
  // set document to blank
  currentFile.value = await getFileObject(BlankDOCX, 'blank_document.docx', DOCX);

  telemetry.value = new Telemetry({
    enabled: false,
    superdocId: 'dev-playground',
  });
});

const toggleLayoutEngine = () => {
  const nextValue = !useLayoutEngine.value;
  const url = new URL(window.location.href);
  url.searchParams.set('layout', nextValue ? '1' : '0');
  window.location.href = url.toString();
};
</script>

<template>
  <div class="dev-app">
    <div class="dev-app__layout">
      <div class="dev-app__header">
        <div class="dev-app__header-side dev-app__header-side--left">
          <div class="dev-app__header-title">
            <h2>Super Editor Dev Area</h2>
          </div>
          <div class="dev-app__header-layout-toggle">
            <span class="badge">Layout Engine: {{ useLayoutEngine ? 'ON' : 'OFF' }}</span>
            <button class="dev-app__header-export-btn" @click="toggleLayoutEngine">
              Turn Layout Engine {{ useLayoutEngine ? 'off' : 'on' }} (reloads)
            </button>
          </div>
          <div class="dev-app__header-upload">
            Upload docx
            <BasicUpload @file-change="handleNewFile" />
          </div>
        </div>
        <div class="dev-app__header-side dev-app__header-side--right">
          <div class="dev-app__content-injection">
            <div class="dev-app__content-controls">
              <select v-model="contentType" class="dev-app__content-type">
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
                <option value="text">Text</option>
              </select>
              <button
                class="dev-app__inject-btn"
                @click="injectContent"
                :disabled="isInjectingContent || !contentInput.trim()"
              >
                {{ isInjectingContent ? 'Injecting...' : 'Inject Content' }}
              </button>
            </div>
            <textarea
              v-model="contentInput"
              class="dev-app__content-input"
              placeholder="Enter content to inject..."
              rows="3"
            ></textarea>
          </div>
          <button class="dev-app__header-export-btn" @click="exportDocx">Export</button>
        </div>
      </div>

      <div id="toolbar" class="sd-toolbar"></div>

      <div class="dev-app__main">
        <div class="dev-app__view" id="dev-parent">
          <!-- temporary - debugging pagination -->
          <div
            style="display: flex; flex-direction: column; margin-right: 10px"
            v-if="useLayoutEngine && isDebuggingPagination"
          >
            <div v-for="i in 100" class="page-spacer" :style="debugPageStyle">page: {{ i }}</div>
          </div>

          <div class="dev-app__content" v-if="currentFile">
            <n-message-provider>
              <SuperEditor :file-source="currentFile" :options="editorOptions" />
            </n-message-provider>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.super-editor {
  border: 1px solid black;
}
</style>

<style scoped>
.sd-toolbar {
  width: 100%;
  background: white;
  position: relative;
  z-index: 1;
}

.page-spacer {
  height: 11in;
  width: 60px;
  background-color: #0000aa55;
  border: 1px solid black;
  margin-bottom: 18px;
  display: flex;
  justify-content: center;
}

.page-spacer:nth-child(odd) {
  background-color: #aa000055;
}

.dev-app {
  --header-height: 154px;
  --toolbar-height: 39px;

  width: 100%;
  height: 100vh;
}

.dev-app__layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
}

.dev-app__header {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  background-color: rgb(222, 237, 243);
  padding: 20px;
}

.dev-app__header-side {
  display: flex;
}

.dev-app__header-side--left {
  flex-direction: column;
}

.dev-app__header-side--right {
  align-items: flex-end;
}

.dev-app__header-layout-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  background: #eef0ff;
  border-radius: 6px;
  font-weight: 600;
}

.dev-app__main {
  display: flex;
  overflow-y: auto;
}

.dev-app__view {
  width: 100%;
  display: flex;
  padding-top: 20px;
  padding-left: 20px;
  padding-right: 20px;
  flex-grow: 1;
  justify-content: center;
}

.dev-app__content {
  display: flex;
  justify-content: center;
}

.dev-app__content-container {
  width: 100%;
  display: flex;
}

.dev-app__inputs-panel {
  display: grid;
  height: calc(100vh - var(--header-height) - var(--toolbar-height));
  background: #fff;
  border-right: 1px solid #dbdbdb;
}

.dev-app__inputs-panel-content {
  display: grid;
  overflow-y: auto;
  scrollbar-width: none;
}

.dev-app__content-injection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-right: 20px;
  min-width: 300px;
}

.dev-app__content-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dev-app__content-type {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
}

.dev-app__inject-btn {
  padding: 6px 12px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.dev-app__inject-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.dev-app__inject-btn:not(:disabled):hover {
  background-color: #0056b3;
}

.dev-app__content-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.dev-app__content-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}
</style>
