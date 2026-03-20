<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Document Diffing</p>
        <h1>Compare two DOCX files side by side</h1>
        <p class="status-text">{{ statusText }}</p>
      </div>

      <div class="header-actions">
        <button
          v-if="!hasCompared"
          class="action-button action-button--primary"
          :disabled="!canCompare"
          @click="compareDocuments"
        >
          {{ isComparing ? 'Comparing…' : 'Compare documents' }}
        </button>

        <button v-else class="action-button action-button--secondary" @click="resetComparison">
          Reset
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

    <main class="workspace">
      <section class="document-pane">
        <div class="pane-header">
          <div>
            <p class="pane-label">Left document</p>
            <p class="pane-caption">
              {{ leftFile ? leftFile.name : 'Load the first .docx file.' }}
            </p>
          </div>

          <label v-if="!hasCompared" class="picker-button">
            <span>{{ leftFile ? 'Replace file' : 'Choose .docx' }}</span>
            <input
              type="file"
              accept=".docx"
              :disabled="isComparing"
              @change="handleFileSelection('left', $event)"
            />
          </label>

          <span v-else class="file-pill">{{ leftFile?.name }}</span>
        </div>

        <div ref="leftContainer" class="editor-host" />
      </section>

      <section class="document-pane">
        <div class="pane-header">
          <div>
            <p class="pane-label">Right document</p>
            <p class="pane-caption">
              {{ rightFile ? rightFile.name : 'Load the second .docx file.' }}
            </p>
          </div>

          <label v-if="!hasCompared" class="picker-button">
            <span>{{ rightFile ? 'Replace file' : 'Choose .docx' }}</span>
            <input
              type="file"
              accept=".docx"
              :disabled="isComparing"
              @change="handleFileSelection('right', $event)"
            />
          </label>

          <span v-else class="file-pill">{{ rightFile?.name }}</span>
        </div>

        <div ref="rightContainer" class="editor-host" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { SuperDoc } from 'superdoc';
import { Editor, getStarterExtensions } from 'superdoc/super-editor';
import 'superdoc/style.css';

type Side = 'left' | 'right';

const DEMO_USER = {
  name: 'Diff Demo',
  email: 'diff-demo@superdoc.dev',
};

const leftContainer = ref<HTMLDivElement | null>(null);
const rightContainer = ref<HTMLDivElement | null>(null);

const leftFile = ref<File | null>(null);
const rightFile = ref<File | null>(null);

const leftReady = ref(false);
const rightReady = ref(false);

const leftSuperdoc = shallowRef<SuperDoc | null>(null);
const rightSuperdoc = shallowRef<SuperDoc | null>(null);

const isComparing = ref(false);
const hasCompared = ref(false);
const errorMessage = ref('');

const canCompare = computed(
  () =>
    Boolean(
      leftFile.value &&
        rightFile.value &&
        leftReady.value &&
        rightReady.value &&
        !isComparing.value &&
        !hasCompared.value,
    ),
);

const statusText = computed(() => {
  if (isComparing.value) return 'Computing both directional diffs and replaying them as tracked changes.';
  if (hasCompared.value) return 'Comparison complete. Reset to load a new pair of documents.';
  if (!leftFile.value || !rightFile.value) return 'Select a .docx file for each side.';
  if (!leftReady.value || !rightReady.value) return 'Loading documents into each editor.';
  return 'Both files are ready. Compare documents to replay tracked changes on both sides.';
});

const buildEditorConfig = (container: HTMLDivElement, file: File | null, side: Side) => ({
  selector: container,
  documentMode: 'editing' as const,
  comments: {
    visible: false,
  },
  trackChanges: {
    visible: true,
  },
  user: DEMO_USER,
  onReady: () => {
    if (side === 'left') {
      leftReady.value = true;
      return;
    }
    rightReady.value = true;
  },
  onException: ({ error }: { error?: unknown }) => {
    const message = error instanceof Error ? error.message : 'Failed to initialize SuperDoc.';
    errorMessage.value = message;
  },
  ...(file ? { document: file } : {}),
});

const destroySuperdoc = (side: Side) => {
  if (side === 'left') {
    leftSuperdoc.value?.destroy();
    leftSuperdoc.value = null;
    leftReady.value = false;
    return;
  }

  rightSuperdoc.value?.destroy();
  rightSuperdoc.value = null;
  rightReady.value = false;
};

const mountSuperdoc = (side: Side) => {
  const container = side === 'left' ? leftContainer.value : rightContainer.value;
  const file = side === 'left' ? leftFile.value : rightFile.value;

  if (!container) return;

  destroySuperdoc(side);

  const instance = new SuperDoc(buildEditorConfig(container, file, side));

  if (side === 'left') {
    leftSuperdoc.value = instance;
    return;
  }

  rightSuperdoc.value = instance;
};

const mountBothEditors = () => {
  mountSuperdoc('left');
  mountSuperdoc('right');
};

const createHeadlessEditor = async (file: File) => {
  const [docx, media, mediaFiles, fonts] = (await Editor.loadXmlData(file)) || [];

  if (!docx) {
    throw new Error(`Unable to load "${file.name}".`);
  }

  return new Editor({
    isHeadless: true,
    skipViewCreation: true,
    extensions: getStarterExtensions(),
    documentId: `diff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
  });
};

const getVisibleEditor = (side: Side) => {
  return side === 'left' ? leftSuperdoc.value?.activeEditor : rightSuperdoc.value?.activeEditor;
};

const handleFileSelection = (side: Side, event: Event) => {
  if (hasCompared.value) return;

  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;

  if (input) {
    input.value = '';
  }

  if (!file) return;

  errorMessage.value = '';

  if (side === 'left') {
    leftFile.value = file;
  } else {
    rightFile.value = file;
  }

  mountSuperdoc(side);
};

const compareDocuments = async () => {
  if (!canCompare.value || !leftFile.value || !rightFile.value) return;

  const leftEditor = getVisibleEditor('left');
  const rightEditor = getVisibleEditor('right');

  if (!leftEditor || !rightEditor) {
    errorMessage.value = 'Both editors must finish loading before comparing.';
    return;
  }

  isComparing.value = true;
  errorMessage.value = '';

  let leftHeadless: Editor | null = null;
  let rightHeadless: Editor | null = null;

  try {
    [leftHeadless, rightHeadless] = await Promise.all([
      createHeadlessEditor(leftFile.value),
      createHeadlessEditor(rightFile.value),
    ]);

    const leftDiff = leftEditor.commands.compareDocuments(
      rightHeadless.state.doc,
      rightHeadless.converter?.comments ?? [],
      rightHeadless.converter?.translatedLinkedStyles ?? null,
      rightHeadless.converter?.translatedNumbering ?? null,
    );

    const rightDiff = rightEditor.commands.compareDocuments(
      leftHeadless.state.doc,
      leftHeadless.converter?.comments ?? [],
      leftHeadless.converter?.translatedLinkedStyles ?? null,
      leftHeadless.converter?.translatedNumbering ?? null,
    );

    leftEditor.commands.replayDifferences(leftDiff, { applyTrackedChanges: true });
    rightEditor.commands.replayDifferences(rightDiff, { applyTrackedChanges: true });

    hasCompared.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Document comparison failed.';
  } finally {
    leftHeadless?.destroy?.();
    rightHeadless?.destroy?.();
    isComparing.value = false;
  }
};

const resetComparison = () => {
  errorMessage.value = '';
  hasCompared.value = false;
  isComparing.value = false;
  leftFile.value = null;
  rightFile.value = null;
  mountBothEditors();
};

onMounted(() => {
  mountBothEditors();
});

onBeforeUnmount(() => {
  destroySuperdoc('left');
  destroySuperdoc('right');
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(13, 148, 136, 0.08), transparent 28rem),
    linear-gradient(180deg, #f7faf9 0%, #eef3f1 100%);
  color: #10221b;
}

.app-header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  align-items: flex-start;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(16, 34, 27, 0.12);
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0f766e;
}

h1 {
  margin: 0;
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  line-height: 1.05;
}

.status-text {
  max-width: 42rem;
  margin: 0.65rem 0 0;
  color: #496259;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.action-button {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.75rem 1.15rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: transform 120ms ease, opacity 120ms ease, background 120ms ease;
}

.action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.action-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.action-button--primary {
  background: #0f766e;
  color: #fff;
}

.action-button--secondary {
  background: #fff;
  border-color: rgba(16, 34, 27, 0.16);
  color: #10221b;
}

.error-banner {
  margin: 0 1.5rem;
  padding: 0.9rem 1rem;
  border-radius: 0 0 1rem 1rem;
  background: #fff1f2;
  color: #9f1239;
  border: 1px solid #fecdd3;
  border-top: none;
}

.workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
  padding: 1.25rem;
  min-height: calc(100vh - 8.5rem);
}

.document-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(16, 34, 27, 0.12);
  border-radius: 1.25rem;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(16, 34, 27, 0.05);
}

.pane-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid rgba(16, 34, 27, 0.1);
  background: rgba(247, 250, 249, 0.92);
}

.pane-label {
  margin: 0;
  font-weight: 700;
}

.pane-caption {
  margin: 0.2rem 0 0;
  color: #5a7068;
  font-size: 0.92rem;
}

.picker-button,
.file-pill {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.65rem 0.95rem;
  font-size: 0.92rem;
}

.picker-button {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: #10221b;
  color: #fff;
}

.picker-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.picker-button input:disabled {
  cursor: not-allowed;
}

.file-pill {
  max-width: min(18rem, 42vw);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: rgba(15, 118, 110, 0.1);
  color: #0f766e;
}

.editor-host {
  flex: 1;
  min-height: 42rem;
  overflow: auto;
  background: #dfe8e4;
}

@media (max-width: 960px) {
  .app-header {
    flex-direction: column;
  }

  .workspace {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .editor-host {
    min-height: 34rem;
  }

  .pane-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-pill {
    max-width: 100%;
  }
}

</style>
<style>
* {
  font-family: Arial, Helvetica, sans-serif;
}
.floating-comments {
  display: none;
}
</style>
