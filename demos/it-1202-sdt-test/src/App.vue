<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const superdocInstance = ref(null);
const editorInstance = ref(null);

// Search and Replace state
const searchQuery = ref('');
const replaceQuery = ref('');
const matchCount = ref(0);
const currentMatchIndex = ref(-1);
const status = ref('');

onMounted(async () => {
  // Load default document
  const docPath = '/SuperDoc.docx';
  let docData = null;
  try {
    const response = await fetch(docPath);
    if (response.ok) {
      docData = await response.blob();
    }
  } catch (e) {
    console.warn('Could not load default document:', e);
  }

  superdocInstance.value = new SuperDoc({
    selector: '#superdoc',
    documentMode: 'editing',
    licenseKey: 'public_license_key_superdocinternal_ad7035140c4b',
    user: {
      id: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
    },
    ...(docData ? { document: { data: docData, id: 'test-doc' } } : {}),
    modules: {
      toolbar: {
        selector: '#toolbar',
      },
      surfaces: {
        findReplace: true,
      },
    },
    onEditorCreate: ({ editor }) => {
      editorInstance.value = editor;
      window.editor = editor;
      window.superdoc = superdocInstance.value;
      status.value = 'Editor ready';
    },
  });
});

onBeforeUnmount(() => {
  superdocInstance.value?.destroy();
});

// SDT Functions - uses Document API (editor.doc.create.contentControl)
const addInlineSdt = async () => {
  const editor = editorInstance.value;
  const api = editor?.doc?.create;
  if (!api?.contentControl) {
    status.value = 'Document API create.contentControl not available';
    return;
  }

  try {
    const result = await api.contentControl({
      kind: 'inline',
      controlType: 'text',
      alias: 'Test Inline SDT',
      lockMode: 'contentLocked',
      content: 'hello world',
    });
    if (result.success) {
      status.value = 'Added inline SDT with locked content "hello world"';
    } else {
      status.value = `Failed: ${result.failure?.message || 'Unknown error'}`;
    }
  } catch (error) {
    status.value = `Error: ${error.message}`;
  }
};

const addBlockSdt = async () => {
  const editor = editorInstance.value;
  const api = editor?.doc?.create;
  if (!api?.contentControl) {
    status.value = 'Document API create.contentControl not available';
    return;
  }

  try {
    const result = await api.contentControl({
      kind: 'block',
      controlType: 'richText',
      alias: 'Test Block SDT',
      lockMode: 'contentLocked',
      content: 'hello world\nhello universe',
    });
    if (result.success) {
      status.value = 'Added block SDT with locked content';
    } else {
      status.value = `Failed: ${result.failure?.message || 'Unknown error'}`;
    }
  } catch (error) {
    status.value = `Error: ${error.message}`;
  }
};

// Search and Replace Functions
const runSearch = () => {
  const editor = editorInstance.value;
  if (!editor?.commands?.setSearchSession) {
    status.value = 'Search commands not available';
    return;
  }

  const query = searchQuery.value.trim();
  if (!query) {
    editor.commands.clearSearchSession?.();
    matchCount.value = 0;
    currentMatchIndex.value = -1;
    status.value = 'Search cleared';
    return;
  }

  try {
    const result = editor.commands.setSearchSession(query, {
      caseSensitive: false,
      ignoreDiacritics: false,
      highlight: true,
    });
    matchCount.value = result.matches?.length || 0;
    currentMatchIndex.value = result.activeMatchIndex ?? -1;
    status.value = `Found ${matchCount.value} matches`;
  } catch (error) {
    status.value = `Search error: ${error.message}`;
  }
};

const nextMatch = () => {
  const editor = editorInstance.value;
  if (!editor?.commands?.nextSearchMatch) return;
  try {
    const result = editor.commands.nextSearchMatch();
    currentMatchIndex.value = result.activeMatchIndex ?? -1;
  } catch (error) {
    status.value = `Error: ${error.message}`;
  }
};

const prevMatch = () => {
  const editor = editorInstance.value;
  if (!editor?.commands?.previousSearchMatch) return;
  try {
    const result = editor.commands.previousSearchMatch();
    currentMatchIndex.value = result.activeMatchIndex ?? -1;
  } catch (error) {
    status.value = `Error: ${error.message}`;
  }
};

const replaceOne = () => {
  const editor = editorInstance.value;
  if (!editor?.commands?.replaceSearchMatch) {
    status.value = 'Replace command not available';
    return;
  }

  if (matchCount.value === 0) {
    status.value = 'No matches to replace';
    return;
  }

  try {
    const result = editor.commands.replaceSearchMatch(replaceQuery.value);
    console.log('replaceSearchMatch result:', result);
    matchCount.value = result.matches?.length || 0;
    currentMatchIndex.value = result.activeMatchIndex ?? -1;
    status.value = `Replaced. ${matchCount.value} matches remaining`;
  } catch (error) {
    console.error('replaceSearchMatch error:', error);
    status.value = `Replace error: ${error.message}`;
  }
};

const replaceAll = () => {
  const editor = editorInstance.value;
  if (!editor?.commands?.replaceAllSearchMatches) {
    status.value = 'Replace all command not available';
    return;
  }

  if (matchCount.value === 0) {
    status.value = 'No matches to replace';
    return;
  }

  try {
    // This is the problematic function from IT-1202
    // It builds a single transaction with all replacements
    // The lock plugin vetoes the entire transaction if any match is in a locked SDT
    const result = editor.commands.replaceAllSearchMatches(replaceQuery.value);
    console.log('replaceAllSearchMatches result:', result);
    matchCount.value = 0;
    currentMatchIndex.value = -1;
    status.value = `Replace all completed. Result: ${JSON.stringify(result)}`;
  } catch (error) {
    console.error('replaceAllSearchMatches error:', error);
    status.value = `Replace all error: ${error.message}`;
  }
};
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>SuperDoc SDT Test - IT-1202</h1>
      <p class="subtitle">Testing replaceAllSearchMatches with locked content controls</p>
    </header>

    <div class="controls">
      <section class="control-section">
        <h3>Content Controls (SDT)</h3>
        <p class="hint">Insert locked content controls to test the replace-all issue.</p>
        <div class="button-row">
          <button @click="addInlineSdt">Add Inline SDT</button>
          <button @click="addBlockSdt">Add Block SDT</button>
        </div>
        <p class="hint small">Inline: "hello world" | Block: "hello world" + "hello universe"</p>
      </section>

      <section class="control-section">
        <h3>Search & Replace</h3>
        <div class="input-group">
          <label>Search:</label>
          <input v-model="searchQuery" placeholder="Search text..." @keydown.enter="runSearch" />
        </div>
        <div class="input-group">
          <label>Replace:</label>
          <input v-model="replaceQuery" placeholder="Replacement..." />
        </div>
        <div class="button-row">
          <button @click="runSearch">Find</button>
          <button @click="prevMatch">←</button>
          <button @click="nextMatch">→</button>
          <button @click="replaceOne" :disabled="matchCount === 0">Replace</button>
          <button @click="replaceAll" :disabled="matchCount === 0" class="primary">Replace All</button>
        </div>
        <p v-if="matchCount > 0" class="match-info">Match {{ currentMatchIndex + 1 }} of {{ matchCount }}</p>
      </section>

      <div v-if="status" class="status">{{ status }}</div>
    </div>

    <div id="toolbar"></div>
    <div id="superdoc"></div>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f1f5f9;
}

.app {
  min-height: 100vh;
}

.header {
  background: #0f172a;
  color: white;
  padding: 16px 24px;
}

.header h1 {
  margin: 0;
  font-size: 20px;
}

.subtitle {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 13px;
}

.controls {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 24px;
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-section h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.hint.small {
  font-size: 11px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-group label {
  font-size: 12px;
  font-weight: 500;
  min-width: 60px;
}

.input-group input {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  width: 180px;
}

.button-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

button {
  padding: 6px 12px;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #dbeafe;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button.primary {
  background: #3b82f6;
  color: white;
}

button.primary:hover:not(:disabled) {
  background: #2563eb;
}

.match-info {
  margin: 0;
  font-size: 12px;
  color: #475569;
}

.status {
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 12px;
  color: #0369a1;
}

#toolbar {
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

#superdoc {
  display: flex;
  justify-content: center;
  padding: 24px;
  min-height: 600px;
}
</style>
