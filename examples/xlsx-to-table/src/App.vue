<template>
  <div class="app">
    <header>
      <h1>XLSX to Table Demo</h1>
      <div class="actions">
        <button @click="docInput?.click()">Load Document</button>
        <input
          type="file"
          ref="docInput"
          accept=".docx"
          class="hidden"
          @change="handleDocChange"
        >
        <button @click="xlsxInput?.click()" :disabled="!editorReady">
          Import XLSX
        </button>
        <input
          type="file"
          ref="xlsxInput"
          accept=".xlsx,.xls,.csv"
          class="hidden"
          @change="handleXlsxChange"
        >
      </div>
    </header>

    <main>
      <DocumentEditor
        ref="documentEditor"
        :initial-data="documentFile"
        @editor-ready="handleEditorReady"
      />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import * as XLSX from 'xlsx';
import DocumentEditor from './components/DocumentEditor.vue';

const documentFile = ref(null);
const docInput = ref(null);
const xlsxInput = ref(null);
const documentEditor = ref(null);
const editorReady = ref(false);
let editorInstance = null;

const handleDocChange = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    documentFile.value = file;
    editorReady.value = false;
    editorInstance = null;
  }
};

const handleEditorReady = (superdoc) => {
  editorInstance = superdoc?.activeEditor;
  editorReady.value = !!editorInstance;
};

const handleXlsxChange = async (event) => {
  const file = event.target.files?.[0];
  if (!file || !editorInstance) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Filter out empty rows and convert all values to strings
    const data = rawData
      .filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''))
      .map(row => row.map(cell => String(cell ?? '')));

    if (data.length === 0) {
      alert('No data found in spreadsheet');
      return;
    }

    insertTable(data);
  } catch (error) {
    console.error('Failed to parse spreadsheet:', error);
    alert('Failed to parse spreadsheet file');
  }

  event.target.value = '';
};

const insertTable = (data) => {
  const cols = Math.max(...data.map(row => row.length));

  // Normalize rows to have consistent column count
  const normalizedData = data.map(row => {
    const normalized = [...row];
    while (normalized.length < cols) {
      normalized.push('');
    }
    return normalized;
  });

  // Insert a template table with 1 row
  editorInstance.commands.insertTable({ rows: 1, cols, withHeaderRow: false });

  // Find the newly inserted table
  const tables = editorInstance.getNodesOfType('table');
  if (!tables?.length) return;

  const tablePos = tables[tables.length - 1].pos;

  // Append all data rows
  editorInstance.commands.appendRowsWithContent({
    tablePos,
    valueRows: normalizedData,
    copyRowStyle: false
  });

  // Delete the empty template row
  editorInstance.commands.deleteRow();
};
</script>

<style>
* {
  box-sizing: border-box;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  padding: 1rem;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid #ddd;
}

header h1 {
  margin: 0;
  font-size: 1.25rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

header button {
  padding: 0.5rem 1rem;
  background: #1355ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

header button:hover:not(:disabled) {
  background: #0044ff;
}

header button:disabled {
  background: #999;
  cursor: not-allowed;
}

.hidden {
  display: none;
}

main {
  flex: 1;
  padding: 1rem;
  overflow: hidden;
}
</style>
