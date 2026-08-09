import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const fileInput = document.querySelector<HTMLInputElement>('#document-file');
const saveButton = document.querySelector<HTMLButtonElement>('#save-document');
const status = document.querySelector<HTMLOutputElement>('#document-status');
if (!fileInput || !saveButton || !status) throw new Error('The document-management controls are incomplete.');

let documentReady = false;
let requiresRecreation = false;
let superdoc: SuperDoc | null = null;

const setControlsBusy = () => {
  fileInput.disabled = true;
  saveButton.disabled = true;
};

const setControlsIdle = () => {
  fileInput.disabled = false;
  saveButton.disabled = !documentReady;
};

const showError = (error: unknown) => {
  status.value = error instanceof Error ? error.message : 'The document operation failed.';
};

const handleRuntimeError = (error: unknown) => {
  showError(error);
  if (documentReady) return;
  requiresRecreation = true;
  setControlsIdle();
};

const openDocument = (document: string | File) => {
  superdoc?.destroy();
  documentReady = false;
  requiresRecreation = false;
  setControlsBusy();
  status.value = 'Opening document…';

  try {
    superdoc = new SuperDoc({
      selector: '#editor',
      document,
      onReady: () => {
        documentReady = true;
        setControlsIdle();
        status.value = 'Document ready.';
      },
      onContentError: ({ error }) => {
        handleRuntimeError(error);
      },
      onException: ({ error }) => {
        handleRuntimeError(error);
      },
    });
  } catch (error) {
    superdoc = null;
    handleRuntimeError(error);
  }
};

const replaceDocument = async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (requiresRecreation) {
    openDocument(file);
    return;
  }

  setControlsBusy();
  try {
    status.value = 'Opening document…';
    if (!superdoc) throw new Error('SuperDoc is not initialized.');
    const result = await superdoc.replaceFile(file);
    const replacementResult = result && typeof result === 'object' ? result : null;
    const replacementState = replacementResult && 'state' in replacementResult ? replacementResult.state : null;
    if (replacementState && replacementState !== 'review-ready' && replacementState !== 'editing-ready') {
      if (replacementResult && 'mount' in replacementResult && replacementResult.mount === null) {
        documentReady = false;
        requiresRecreation = true;
      }
      showError(new Error('SuperDoc could not open the selected DOCX.'));
      return;
    }
    documentReady = true;
    status.value = 'Document ready.';
  } catch (error) {
    documentReady = false;
    requiresRecreation = true;
    showError(error);
  } finally {
    setControlsIdle();
  }
};

const uploadDocument = async () => {
  setControlsBusy();
  try {
    status.value = 'Preparing DOCX…';
    if (!superdoc) throw new Error('SuperDoc is not initialized.');
    const result = await superdoc.export({ exportType: ['docx'], triggerDownload: false });
    if (!(result instanceof Blob)) throw new Error('SuperDoc did not return a DOCX blob.');

    const body = new FormData();
    body.set('document', result, 'contract.docx');
    const response = await fetch('/api/documents/contract', { method: 'PUT', body });
    if (!response.ok) throw new Error(`Upload failed with ${response.status}.`);
    status.value = 'Saved.';
  } catch (error) {
    showError(error);
  } finally {
    setControlsIdle();
  }
};

fileInput.addEventListener('change', replaceDocument);
saveButton.addEventListener('click', uploadDocument);
openDocument('/contract.docx');

window.addEventListener('beforeunload', () => {
  fileInput.removeEventListener('change', replaceDocument);
  saveButton.removeEventListener('click', uploadDocument);
  superdoc?.destroy();
});
