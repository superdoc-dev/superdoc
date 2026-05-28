import { SuperDoc } from 'superdoc';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// Switch to this import to verify that app-layer overrides stop winning:
// import 'superdoc/style.css';
import 'superdoc/style.layered.css';
import './app-layer.css';

const editorEl = document.getElementById('editor');
const fileInput = document.getElementById('file-input');
const modeSelect = document.getElementById('mode-select');
const reloadBtn = document.getElementById('reload-btn');
const statusEl = document.getElementById('status');

let superdoc = null;
let currentFile = null;

function status(text) {
  statusEl.textContent = text;
}

function createEditor() {
  superdoc?.destroy();

  const mode = modeSelect.value;
  const isPdf = currentFile && currentFile.name.toLowerCase().endsWith('.pdf');

  superdoc = new SuperDoc({
    selector: editorEl,
    toolbar: '#toolbar',
    document: currentFile ?? undefined,
    documentMode: mode,
    modules: {
      toolbar: true,
      pdf: {
        pdfLib: pdfjsLib,
        workerSrc,
        setWorker: true,
        textLayer: true,
      },
    },
  });

  if (!currentFile) {
    status('Empty editor ready. Select a .docx or .pdf file.');
    return;
  }

  const kind = isPdf ? 'PDF' : 'DOCX';
  status(`${kind} loaded in ${mode} mode with layered stylesheet.`);
}

fileInput.addEventListener('change', (event) => {
  currentFile = event.target.files?.[0] ?? null;
  createEditor();
});

modeSelect.addEventListener('change', () => {
  if (!superdoc) return;
  createEditor();
});

reloadBtn.addEventListener('click', () => {
  createEditor();
});

createEditor();
