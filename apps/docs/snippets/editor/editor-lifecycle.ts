import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const status = document.querySelector<HTMLOutputElement>('#editor-status');
if (!status) throw new Error('The Editor status output is missing.');

const superdoc = new SuperDoc({
  selector: '#editor',
  document: '/contract.docx',
  onReady: () => {
    status.value = 'Ready';
  },
  onEditorUpdate: () => {
    status.value = 'Unsaved changes';
  },
  onContentError: ({ error }) => {
    status.value = error instanceof Error ? error.message : 'The document could not be loaded.';
  },
  onException: ({ error }) => {
    console.error('SuperDoc exception', error);
  },
});

const handleModeChange = ({ documentMode }: { documentMode: 'editing' | 'suggesting' | 'viewing' }) => {
  status.value = `Mode: ${documentMode}`;
};

superdoc.on('document-mode-change', handleModeChange);

window.addEventListener('beforeunload', () => {
  superdoc.off('document-mode-change', handleModeChange);
  superdoc.destroy();
});
