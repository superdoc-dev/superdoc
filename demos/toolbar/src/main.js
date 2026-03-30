import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';
import catSvg from './icon_cat.svg?raw';

const getCatGifUrl = () => `https://edgecats.net/first?ts=${Date.now()}`;

// Initialize SuperDoc
let editor = null;

function initializeEditor(file = null) {
  // Cleanup previous instance if it exists
  if (editor) {
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
    },
    modules: {
      toolbar: {
        customButtons: [{
          type: 'button',
          name: 'insertCatGIF',
          tooltip: 'Insert a cute cat GIF',
          icon: catSvg,
          group: 'center',
          command: () => {
            editor.activeEditor.commands.setImage({
              src: getCatGifUrl(),
              alt: 'Random cat GIF',
            });
          }
        }]
      }
    }
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
