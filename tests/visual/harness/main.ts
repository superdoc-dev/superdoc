import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';
import { getRequestedCustomExtensionNames, resolveCustomExtensions } from './custom-extensions.js';

const params = new URLSearchParams(location.search);
const layout = params.get('layout') !== '0';
const hideCaret = params.get('hideCaret') !== '0';
const hideSelection = params.get('hideSelection') !== '0';
const toolbar = params.get('toolbar');
const comments = params.get('comments');
const trackChanges = params.get('trackChanges') === '1';
const customExtensionNames = getRequestedCustomExtensionNames(params);

if (hideCaret) {
  document.documentElement.style.setProperty('caret-color', 'transparent', 'important');
}

let instance: any = null;

function init(file?: File) {
  if (instance) {
    instance.destroy();
    instance = null;
  }

  (window as any).superdocReady = false;

  const config: any = {
    selector: '#editor',
    useLayoutEngine: layout,
    telemetry: { enabled: false },
    onReady: ({ superdoc }: any) => {
      (window as any).superdoc = superdoc;
      superdoc.activeEditor.on('create', ({ editor }: any) => {
        (window as any).editor = editor;
      });
      (window as any).superdocReady = true;
    },
  };

  if (file) {
    config.document = file;
  }

  // Toolbar
  if (toolbar && toolbar !== 'none') {
    config.toolbar = document.getElementById('toolbar');
  }

  // Comments
  if (comments === 'on' || comments === 'panel') {
    config.comments = { visible: true };
  } else if (comments === 'readonly') {
    config.comments = { visible: true, readOnly: true };
  }

  // Track changes
  if (trackChanges) {
    config.trackChanges = { visible: true };
  }

  const customExtensions = resolveCustomExtensions(customExtensionNames);
  if (customExtensions.length > 0) {
    config.editorExtensions = customExtensions;
  }

  instance = new SuperDoc(config);

  if (hideSelection) {
    const style = document.createElement('style');
    style.textContent = `
      .superdoc-selection-overlay,
      .superdoc-caret { display: none !important; }
    `;
    document.head.appendChild(style);
  }
}

document.querySelector('input[type="file"]')!.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) init(file);
});

init();
