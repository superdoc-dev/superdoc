import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const boldButton = document.querySelector<HTMLButtonElement>('#bold');
const exportButton = document.querySelector<HTMLButtonElement>('#export-docx');
const status = document.querySelector<HTMLSpanElement>('#status');

if (!boldButton || !exportButton || !status) throw new Error('The custom controls are missing.');

let stopBold: (() => void) | null = null;

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/sample.docx',
  ui: false,
  onReady: ({ superdoc: readySuperDoc }) => {
    const bold = readySuperDoc.ui.commands.get('bold');
    stopBold = bold.observe((state) => {
      boldButton.disabled = !state.enabled;
      boldButton.setAttribute('aria-pressed', String(state.active));
    });

    boldButton.addEventListener('mousedown', (event) => event.preventDefault());
    boldButton.addEventListener('click', async () => {
      const result = await bold.executeAsync();
      const applied = typeof result === 'boolean' ? result : result.success;
      status.textContent = applied ? 'Bold applied.' : 'Bold was not applied.';
    });

    exportButton.disabled = false;
    status.textContent = 'Select text to format it.';
  },
  onException: ({ error }) => {
    status.textContent = 'The document could not be opened.';
    console.error(error);
  },
});

exportButton.addEventListener('click', async () => {
  exportButton.disabled = true;
  try {
    await superdoc.export({ exportType: ['docx'], exportedName: 'custom-ui' });
  } finally {
    exportButton.disabled = false;
  }
});

window.addEventListener('beforeunload', () => {
  stopBold?.();
  superdoc.destroy();
});
