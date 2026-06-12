import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

let superdoc = null;

function initSuperdoc(document = null) {
  superdoc?.destroy();

  const config = {
    selector: '#editor',
    documentMode: 'editing',
    modules: {
      toolbar: {
        selector: '#toolbar',
      },
    },
  };

  if (document) {
    config.document = document;
  }

  superdoc = new SuperDoc(config);
  window.superdoc = superdoc;

  // Log version on ready
  superdoc.on('ready', () => {
    console.log('SuperDoc ready');
  });
}

// Initialize with blank document
initSuperdoc();

// Import handler
document.getElementById('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  initSuperdoc(file);
  e.target.value = ''; // Reset input
});

// Export handler
document.getElementById('export-btn').addEventListener('click', async () => {
  if (!superdoc) return;

  try {
    await superdoc.export();
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed: ' + err.message);
  }
});
