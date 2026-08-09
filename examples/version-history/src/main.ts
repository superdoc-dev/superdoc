import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const saveButton = document.querySelector<HTMLButtonElement>('#save-version');
const exportButton = document.querySelector<HTMLButtonElement>('#export-docx');
const versionList = document.querySelector<HTMLOListElement>('#versions');
const status = document.querySelector<HTMLSpanElement>('#status');

if (!saveButton || !exportButton || !versionList || !status) {
  throw new Error('The version history controls are missing.');
}

const versions: Blob[] = [];

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/sample.docx',
  onReady: () => {
    saveButton.disabled = false;
    exportButton.disabled = false;
    status.textContent = 'Document ready.';
  },
  onException: ({ error }) => {
    status.textContent = 'The document could not be opened.';
    console.error(error);
  },
});

const setBusy = (busy: boolean) => {
  saveButton.disabled = busy;
  exportButton.disabled = busy;
  for (const button of versionList.querySelectorAll('button')) button.disabled = busy;
};

const restoreVersion = async (index: number) => {
  setBusy(true);
  status.textContent = `Restoring version ${index + 1}...`;
  try {
    await superdoc.replaceFile(versions[index]);
    status.textContent = `Version ${index + 1} restored.`;
  } finally {
    setBusy(false);
  }
};

saveButton.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = 'Saving version...';
  try {
    const result = await superdoc.export({ exportType: ['docx'], triggerDownload: false });
    if (!(result instanceof Blob)) throw new Error('SuperDoc did not return a DOCX blob.');

    versions.push(result);
    const index = versions.length - 1;
    const item = document.createElement('li');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = `Restore version ${index + 1}`;
    restore.addEventListener('click', () => void restoreVersion(index));
    item.append(restore);
    versionList.append(item);
    status.textContent = `Version ${index + 1} saved.`;
  } catch (error) {
    status.textContent = 'The version could not be saved.';
    console.error(error);
  } finally {
    setBusy(false);
  }
});

exportButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    await superdoc.export({ exportType: ['docx'], exportedName: 'restored-version' });
  } finally {
    setBusy(false);
  }
});

window.addEventListener('beforeunload', () => superdoc.destroy());
