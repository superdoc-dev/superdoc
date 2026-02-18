import 'superdoc/style.css';
import { SuperDoc } from 'superdoc';

type SuperDocConfig = ConstructorParameters<typeof SuperDoc>[0];
type SuperDocInstance = InstanceType<typeof SuperDoc>;
type SuperDocReadyPayload = Parameters<NonNullable<SuperDocConfig['onReady']>>[0];

type HarnessWindow = Window &
  typeof globalThis & {
    superdocReady?: boolean;
    superdoc?: SuperDocInstance;
    editor?: unknown;
  };

const harnessWindow = window as HarnessWindow;

const params = new URLSearchParams(location.search);
const layout = params.get('layout') !== '0';
const showCaret = params.get('showCaret') === '1';
const showSelection = params.get('showSelection') === '1';
const toolbar = params.get('toolbar');
const comments = params.get('comments');
const trackChanges = params.get('trackChanges') === '1';

if (!showCaret) {
  document.documentElement.style.setProperty('caret-color', 'transparent', 'important');
}

let instance: SuperDocInstance | null = null;

function init(file?: File) {
  if (instance) {
    instance.destroy();
    instance = null;
  }

  harnessWindow.superdocReady = false;

  const config: SuperDocConfig = {
    selector: '#editor',
    useLayoutEngine: layout,
    telemetry: { enabled: false },
    onReady: ({ superdoc }: SuperDocReadyPayload) => {
      harnessWindow.superdoc = superdoc;
      superdoc.activeEditor.on('create', (payload: unknown) => {
        if (!payload || typeof payload !== 'object' || !('editor' in payload)) return;
        harnessWindow.editor = (payload as { editor: unknown }).editor;
      });
      harnessWindow.superdocReady = true;
    },
  };

  if (file) {
    config.document = file;
  }

  // Toolbar — pass selector string, not DOM element
  // (SuperToolbar.findElementBySelector expects a string)
  if (toolbar && toolbar !== 'none') {
    config.toolbar = '#toolbar';
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

  instance = new SuperDoc(config);

  if (!showSelection) {
    const style = document.createElement('style');
    style.textContent = `
      .superdoc-selection-overlay,
      .superdoc-caret { display: none !important; }
    `;
    document.head.appendChild(style);
  }
}

const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
if (!fileInput) {
  throw new Error('Behavior harness requires an input[type="file"] element.');
}

fileInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) init(file);
});

init();
