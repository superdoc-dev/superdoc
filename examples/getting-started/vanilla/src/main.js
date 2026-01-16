import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

// Initialize SuperDoc
let editor = null;

function initializeEditor(file = null) {
  // Cleanup previous instance if it exists
  if (editor) {
    editor.destroy();
    editor = null;
  }

  editor = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    document: file, // URL, File or document config
    documentMode: 'editing',
    pagination: true,
    rulers: true,
    onReady: (event) => {
      console.log('SuperDoc is ready', event);
    },
    onEditorCreate: (event) => {
      console.log('Editor is created', event);
      
      // Get page count after editor is created
      setTimeout(() => {
        const documents = editor.superdocStore.documents;
        const presentationEditor = documents[0]?.getPresentationEditor();
        
        if (presentationEditor) {
          const pages = presentationEditor.getPages();
          const pageCount = pages.length;
          console.log(`Document has ${pageCount} page(s)`);
          
          // Display page count in UI
          const pageCountDisplay = document.getElementById('pageCount');
          if (pageCountDisplay) {
            pageCountDisplay.textContent = `Pages: ${pageCount}`;
          }
        }
      }, 100); // Small delay to ensure layout is complete
    },
  });
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
    initializeEditor(file);
  }
});

// Initialize empty editor on page load
initializeEditor();