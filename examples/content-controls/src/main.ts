import { SuperDoc } from 'superdoc';
import type { ContentControlInfo } from 'superdoc/ui';
import 'superdoc/style.css';

const fieldValue = document.querySelector<HTMLInputElement>('#field-value');
const updateButton = document.querySelector<HTMLButtonElement>('#update-field');
const exportButton = document.querySelector<HTMLButtonElement>('#export-docx');
const status = document.querySelector<HTMLSpanElement>('#status');

if (!fieldValue || !updateButton || !exportButton || !status) {
  throw new Error('The content control inputs are missing.');
}

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/content-control.docx',
  onReady: ({ superdoc: readySuperDoc }) => {
    const doc = readySuperDoc.activeEditor?.doc;
    if (!doc) throw new Error('The Document API is not ready.');

    const controls = readySuperDoc.ui.contentControls;
    let control: ContentControlInfo | null = null;
    let fieldDirty = false;
    fieldValue.addEventListener('input', () => {
      fieldDirty = true;
    });

    const stop = controls.observe((snapshot) => {
      const nextControl = snapshot.items.find((item) => item.properties.tag === 'company-name');
      if (!nextControl || nextControl.controlType !== 'text') return;

      control = nextControl;
      if (!fieldDirty) fieldValue.value = control.text ?? '';
      fieldValue.disabled = false;
      updateButton.disabled = false;
      exportButton.disabled = false;
      if (status.textContent === 'Opening document...') status.textContent = 'Field ready.';
    });

    updateButton.addEventListener('click', async () => {
      if (!control) return;
      const receipt = await doc.contentControls.text.setValue({ target: control.target, value: fieldValue.value });
      if (receipt.success) fieldDirty = false;
      status.textContent = receipt.success ? 'Field updated.' : receipt.failure.message;
    });

    controls.list();
    window.addEventListener('beforeunload', stop, { once: true });
  },
  onException: ({ error }) => {
    status.textContent = 'The document could not be opened.';
    console.error(error);
  },
});

exportButton.addEventListener('click', async () => {
  exportButton.disabled = true;
  try {
    await superdoc.export({ exportType: ['docx'], exportedName: 'content-controls' });
  } finally {
    exportButton.disabled = false;
  }
});

window.addEventListener('beforeunload', () => superdoc.destroy());
