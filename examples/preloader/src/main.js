import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

let superdoc = null;

/**
 * Initialize SuperDoc and return a promise that resolves when the document is ready.
 * This allows you to await the initialization and show a loading state.
 *
 * @param {File|string|object} document - URL, File, or document config
 * @returns {Promise<{superdoc: SuperDoc, editor: object}>}
 */
function initSuperdoc(document = null) {
  return new Promise((resolve, reject) => {
    // Cleanup previous instance
    if (superdoc) {
      superdoc.destroy();
      superdoc = null;
    }

    superdoc = new SuperDoc({
      selector: '#superdoc',
      toolbar: '#superdoc-toolbar',
      document,
      documentMode: 'editing',
      pagination: true,
      rulers: true,
      onReady: (event) => {
        console.log('onReady event:', event);
        resolve({ superdoc, event });
      },
      onException: (error) => {
        reject(error);
      },
    });
  });
}

/**
 * Show the loading spinner
 */
function showSpinner() {
  document.getElementById('spinner').classList.add('visible');
  document.querySelector('.editor-wrapper').classList.add('loading');
}

/**
 * Hide the loading spinner
 */
function hideSpinner() {
  document.getElementById('spinner').classList.remove('visible');
  document.querySelector('.editor-wrapper').classList.remove('loading');
}

/**
 * Load a document with loading state
 */
async function loadDocument(file = null) {
  showSpinner();

  try {
    const { superdoc, event } = await initSuperdoc(file);
    console.log('Document loaded successfully', { superdoc, event });
  } catch (error) {
    console.error('Failed to load document:', error);
    alert('Failed to load document. Please try again.');
  } finally {
    hideSpinner();
  }
}

// Setup file input handling
const fileInput = document.getElementById('fileInput');
const loadButton = document.getElementById('loadButton');

loadButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    loadDocument(file);
  }
});

// Initialize with blank document on page load
loadDocument();
