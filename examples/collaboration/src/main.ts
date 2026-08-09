import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

const exportButton = document.querySelector<HTMLButtonElement>('#export-docx');
const status = document.querySelector<HTMLSpanElement>('#status');
if (!exportButton || !status) throw new Error('The collaboration controls are missing.');

const response = await fetch('/sample.docx');
if (!response.ok) throw new Error(`The sample document returned ${response.status}.`);

const params = new URLSearchParams(window.location.search);
const roomMode = params.get('mode') === 'create' ? 'create' : 'join';
const userName = params.get('user') ?? 'Browser user';

const superdoc = new SuperDoc({
  selector: '#editor',
  documents: [
    {
      id: 'shared-document',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: await response.blob(),
      v2Collaboration: {
        providerType: 'hocuspocus',
        documentId: 'example-room',
        serverUrl: 'ws://127.0.0.1:1234',
        roomMode,
      },
    },
  ],
  user: { name: userName, email: `${userName.toLowerCase().replaceAll(' ', '-')}@example.com` },
  onCollaborationReady: () => {
    exportButton.disabled = false;
    status.textContent = 'Connected.';
  },
  onException: ({ error }) => {
    status.textContent = 'Connection failed.';
    console.error(error);
  },
});

exportButton.addEventListener('click', async () => {
  exportButton.disabled = true;
  try {
    await superdoc.export({ exportType: ['docx'], exportedName: 'collaborative-document' });
  } finally {
    exportButton.disabled = false;
  }
});

window.addEventListener('beforeunload', () => superdoc.destroy());
