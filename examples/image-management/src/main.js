import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import './style.css';

let superdoc = null;
let editor = null;

// Get all image nodes in the document
function getImageNodes() {
  if (!editor) return [];
  const images = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      images.push({ node, pos });
    }
  });
  return images;
}

// Update the image count display
function updateImageCount() {
  const images = getImageNodes();
  const countEl = document.getElementById('imageCount');
  countEl.textContent = `(${images.length} images found)`;
}

// Delete all images from the document
function deleteAllImages() {
  if (!editor) return;

  const images = getImageNodes();
  if (images.length === 0) {
    alert('No images to delete');
    return;
  }

  if (!confirm(`Delete all ${images.length} images?`)) return;

  const { tr } = editor.state;

  // Delete in reverse order to preserve positions
  images.reverse().forEach(({ pos, node }) => {
    tr.delete(pos, pos + node.nodeSize);
  });

  editor.view.dispatch(tr);
  updateImageCount();
}

// Initialize SuperDoc
function initializeEditor(file = null) {
  if (superdoc) {
    superdoc.destroy();
    superdoc = null;
    editor = null;
  }

  superdoc = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    document: file,
    documentMode: 'editing',
    pagination: true,
    onEditorCreate: (event) => {
      editor = event.editor;
      console.log('Editor ready');
      setTimeout(updateImageCount, 100);
    },
  });
}

// Setup event listeners
const fileInput = document.getElementById('fileInput');
const loadButton = document.getElementById('loadButton');
const deleteButton = document.getElementById('deleteButton');

loadButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) {
    initializeEditor(file);
  }
});

deleteButton.addEventListener('click', deleteAllImages);

// Initialize empty editor
initializeEditor();
