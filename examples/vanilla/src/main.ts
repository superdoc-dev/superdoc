import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const exportButton = document.querySelector<HTMLButtonElement>('#export-docx');

if (!exportButton) throw new Error('The export button is missing.');

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/sample.docx',
  onReady: () => {
    exportButton.disabled = false;
  },
  onException: ({ error }) => {
    console.error('SuperDoc could not open the document.', error);
  },
});

exportButton.addEventListener('click', async () => {
  exportButton.disabled = true;
  try {
    await superdoc.export({ exportType: ['docx'], exportedName: 'sample-edited' });
  } catch (error) {
    console.error('SuperDoc could not export the document.', error);
  } finally {
    exportButton.disabled = false;
  }
});
