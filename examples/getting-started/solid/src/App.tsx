import { createEffect, createSignal, createUniqueId, onCleanup, Show, untrack } from 'solid-js';
import { SuperDoc } from 'superdoc';
import { superdocFonts } from '@superdoc/fonts';
import 'superdoc/style.css';
import './App.css';

type SuperDocInstance = InstanceType<typeof SuperDoc>;
type SuperDocConfig = ConstructorParameters<typeof SuperDoc>[0];
type DocumentMode = NonNullable<SuperDocConfig['documentMode']>;

/**
 * SuperDoc Solid + TypeScript Example
 *
 * Demonstrates:
 * - File upload with type safety
 * - Document mode switching (editing/viewing/suggesting)
 * - Export functionality via ref API
 * - User information
 * - Loading states
 * - Event callbacks
 */
export default function App() {
  // Document state
  const [document, setDocument] = createSignal<File | null>(null);
  const [mode, setMode] = createSignal<DocumentMode>('editing');
  const [isReady, setIsReady] = createSignal(false);
  const [editorContainerRef, setEditorContainerRef] = createSignal<HTMLDivElement | null>(null);

  // Ref for accessing SuperDoc instance methods
  let fileInputRef: HTMLInputElement | undefined;
  let superdoc: SuperDocInstance | null = null;

  const containerId = `superdoc${createUniqueId()}`;
  const toolbarId = `superdoc-toolbar${createUniqueId()}`;

  // Current user (typed)
  const currentUser = {
    name: 'John Doe',
    email: 'john@example.com',
  };

  function handleGetHTML() {
    const html = superdoc?.getHTML();
    if (!html) return;

    console.log('Document HTML:', html);
    alert(`Document has ${html.length} section(s). Check console for HTML.`);
  }

  function selectMode(nextMode: DocumentMode) {
    setMode(nextMode);
    superdoc?.setDocumentMode(nextMode);
  }

  function ModeButton(props: { targetMode: DocumentMode; label: string }) {
    return (
      <button
        class='mode-btn'
        classList={{ active: mode() === props.targetMode }}
        onClick={() => selectMode(props.targetMode)}
        disabled={!document()}
      >
        {props.label}
      </button>
    );
  }

  createEffect(() => {
    const doc = document();
    if (!doc || !editorContainerRef()) return;

    superdoc = new SuperDoc({
      selector: `#${CSS.escape(containerId)}`,
      toolbar: `#${CSS.escape(toolbarId)}`,
      document: doc,
      fonts: superdocFonts,
      documentMode: untrack(() => mode()),
      role: 'editor',
      user: currentUser,
      rulers: true,
      onReady: (editor) => {
        console.log('SuperDoc ready:', editor.superdoc);
        setIsReady(true);
      },
      onEditorCreate: (event) => {
        console.log('ProseMirror editor created:', event);
      },
      onEditorUpdate: () => {
        console.log('Document updated');
      },
      onContentError: (event) => {
        console.error('Content error:', event);
      },
    });

    onCleanup(() => {
      superdoc?.destroy();
      superdoc = null;
    });
  });

  return (
    <div class='app'>
      <header class='header'>
        <h1>SuperDoc Solid + TypeScript</h1>
        <div class='controls'>
          <button class='btn primary' onClick={() => fileInputRef?.click()}>
            {document() ? 'Change Document' : 'Open Document'}
          </button>
          <input
            hidden
            ref={fileInputRef}
            type='file'
            accept='.docx'
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && file.name.endsWith('.docx')) {
                setDocument(file);
                setIsReady(false);
              }
            }}
          />
          <Show when={document()}>
            <div class='mode-switcher'>
              <ModeButton targetMode='editing' label='Edit' />
              <ModeButton targetMode='suggesting' label='Suggest' />
              <ModeButton targetMode='viewing' label='View' />
            </div>
          </Show>
          <Show when={document() && isReady()}>
            <div class='actions'>
              <button class='btn' onClick={async () => superdoc?.export({ triggerDownload: true })}>
                Export DOCX
              </button>
              <button class='btn' onClick={handleGetHTML}>
                Get HTML
              </button>
            </div>
          </Show>
        </div>
        <Show when={document()}>
          <div class='status'>
            <span class='status-dot' classList={{ ready: isReady(), loading: !isReady() }} />
            <span>{isReady() ? `Ready - ${mode()} mode` : 'Loading...'}</span>
          </div>
        </Show>
      </header>
      <main class='editor-area'>
        <Show
          when={document()}
          fallback={
            <div class='empty-state'>
              <div class='empty-content'>
                <h2>No Document Loaded</h2>
                <p>Click "Open Document" to load a .docx file</p>
                <button class='btn primary large' onClick={() => fileInputRef?.click()}>
                  Open Document
                </button>
              </div>
            </div>
          }
        >
          <div id={toolbarId} class='toolbar-container' />
          <div id={containerId} ref={setEditorContainerRef} class='editor-container' style={{ height: '100%' }} />
          <Show when={!isReady()}>
            <div class='loading-state'>
              <div class='spinner' />
              <p>Loading document...</p>
            </div>
          </Show>
        </Show>
      </main>
    </div>
  );
}
