// Imports
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

// Init
let editor = null;

//Init SuperDoc from DOCX file
function initSuperDocFromFile(file = null) {
  if (editor) {
    editor = null;
  }

  editor = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    document: file, // DOCX URL, File object, or document config
    documentMode: 'editing',
    mode: 'docx',
    pagination: true,
    rulers: true,
    onReady: (event) => {
      const docJSON = event.superdoc.activeEditor.getJSON();
      console.log('SuperDoc ready - JSON', docJSON);
    },
    onEditorUpdate: (event) => {
      const docJSON = event.editor.getJSON();
      console.log('SuperDoc updated - JSON', docJSON);
    },
  });
}

//Init SuperDoc from JSON
function initSuperDocFromJSON() {
  if (editor) {
    editor = null;
  }

  //Hardcoded demo JSON
  const demoJSON = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hello, SuperDoc~!!',
          },
        ],
      },
    ],
  };

  editor = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    documentMode: 'editing',

    /* LOADING JSON */
    //https://docs.superdoc.dev/core/supereditor/configuration#param-options-content
    mode: 'docx',
    jsonOverride: demoJSON,

    pagination: true,
    rulers: true,
    onReady: (event) => {
      const docJSON = event.superdoc.activeEditor.getJSON();
      console.log('SuperDoc ready - JSON', docJSON);
    },
    onEditorUpdate: (event) => {
      const docJSON = event.editor.getJSON();
      console.log('SuperDoc updated - JSON', docJSON);
    },
  });
}

// Setup file input handling
const fileInput = document.getElementById('fileInput');
const loadButton = document.getElementById('loadButton');
const loadJSON = document.getElementById('loadJSON');

loadButton.addEventListener('click', () => {
  fileInput.click();
});

loadJSON.addEventListener('click', () => {
  initSuperDocFromJSON();
});

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    initSuperDocFromFile(file);
  }
});

// Initialize empty editor on page load
initSuperDocFromFile(null);
