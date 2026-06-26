import { useState, useCallback, createContext, useContext } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { SuperDocUIProvider, useSuperDocUI, useSetSuperDoc } from 'superdoc/ui/react';
import './styles.css';

const USER = { name: 'Demo User', email: 'demo@example.com' };
const MODULES = {
  comments: { defaultOpen: true },
  trackChanges: true,
};

// Context to share document source state between components
const DocumentContext = createContext<{
  documentSource: string | File;
  setDocumentSource: (source: string | File) => void;
} | null>(null);

export function App() {
  const [documentSource, setDocumentSource] = useState<string | File>('/sample-review.docx');

  return (
    <DocumentContext.Provider value={{ documentSource, setDocumentSource }}>
      <SuperDocUIProvider>
        <AppInner />
      </SuperDocUIProvider>
    </DocumentContext.Provider>
  );
}

function AppInner() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Flatten SDT Export Demo</h1>
        <p className="subtitle">
          Export with SDTs flattened to plain text, then restore the original document.
        </p>
        <div className="demo-toolbar">
          <InsertSDTButton />
          <FlattenAndExportButton />
        </div>
      </header>

      <div className="editor-container">
        <EditorMount />
      </div>
    </div>
  );
}

function EditorMount() {
  const setSuperDoc = useSetSuperDoc();
  const docCtx = useContext(DocumentContext);

  const handleReady = useCallback(
    ({ superdoc }: { superdoc: unknown }) => {
      setSuperDoc(superdoc);
    },
    [setSuperDoc]
  );

  if (!docCtx) return null;

  // Use a key based on the document source to force remount when it changes
  const key = docCtx.documentSource instanceof File
    ? `file-${docCtx.documentSource.name}-${docCtx.documentSource.lastModified}`
    : docCtx.documentSource;

  return (
    <SuperDocEditor
      key={key}
      document={docCtx.documentSource}
      documentMode="editing"
      user={USER}
      modules={MODULES}
      telemetry={{ enabled: false }}
      onReady={handleReady}
    />
  );
}

/**
 * Insert an SDT with "Hello World" text at the current cursor position.
 */
function InsertSDTButton() {
  const ui = useSuperDocUI();
  const [counter, setCounter] = useState(1);

  const onClick = () => {
    if (!ui) return;

    const reg = ui.commands.register({
      id: 'demo.insertSDT',
      execute: ({ editor }: { editor: any }) => {
        if (!editor?.doc?.create?.contentControl) {
          console.error('[InsertSDT] No create.contentControl API available');
          return false;
        }

        const selectionTarget = ui.selection.getSnapshot().selectionTarget;
        if (!selectionTarget) {
          console.error('[InsertSDT] No selection target');
          return false;
        }

        const result = editor.doc.create.contentControl({
          kind: 'inline',
          at: selectionTarget,
          content: `Hello World #${counter}`,
          tag: `test-sdt-${counter}`,
        });

        if (result?.success) {
          console.log(`[InsertSDT] Created SDT #${counter}`);
          setCounter((c) => c + 1);
          return true;
        }
        return false;
      },
    });

    reg.handle.execute();
    reg.unregister();
  };

  return (
    <button className="btn" disabled={!ui} onClick={onClick}>
      + Insert SDT
    </button>
  );
}

/**
 * Flatten all SDTs and export, then restore the original document.
 *
 * Flow:
 * 1. Export current document to buffer (preserves SDTs)
 * 2. Flatten all SDTs in the editor
 * 3. Export the flattened document (triggers download)
 * 4. Reload from buffer to restore original state with SDTs
 */
function FlattenAndExportButton() {
  const ui = useSuperDocUI();
  const docCtx = useContext(DocumentContext);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!ui || !docCtx || busy) return;
    setBusy(true);

    try {
      // Step 1: Export current document to buffer (no download)
      console.log('[Export] Saving current state to buffer...');
      const buffer = await ui.document.export({
        exportType: ['docx'],
        triggerDownload: false,
      });
      if (!buffer || !(buffer instanceof Blob)) {
        throw new Error('Failed to export document to buffer');
      }
      console.log('[Export] Buffer saved');

      // Step 2: Flatten all SDTs
      console.log('[Export] Flattening SDTs...');
      let flattenCount = 0;
      const reg = ui.commands.register({
        id: 'demo.flatten',
        execute: ({ editor }: { editor: any }) => {
          if (!editor?.doc?.contentControls) return false;
          flattenCount = flattenContentControls(editor.doc);
          return true;
        },
      });
      reg.handle.execute();
      reg.unregister();
      console.log(`[Export] Flattened ${flattenCount} SDTs`);

      // Step 3: Export the flattened document (with download)
      console.log('[Export] Downloading flattened document...');
      await ui.document.export({
        exportType: ['docx'],
        triggerDownload: true,
      });
      console.log('[Export] Download complete');

      // Step 4: Reload from buffer to restore original state
      // By changing the document source, we force a full editor remount
      // which clears all state including the comments store
      console.log('[Export] Restoring original document...');
      const file = new File([buffer], `restored-${Date.now()}.docx`, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      docCtx.setDocumentSource(file);
      console.log('[Export] Original document restored with SDTs');

    } catch (err) {
      console.error('[Export] Failed:', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn btn-primary" disabled={!ui || busy} onClick={onClick}>
      {busy ? 'Exporting...' : 'Flatten & Export'}
    </button>
  );
}

/**
 * Flatten all SDTs (Content Controls) in a document to plain text.
 *
 * Uses the public Document API:
 * - contentControls.list() to discover all SDTs
 * - contentControls.unwrap() to flatten each one
 */
function flattenContentControls(docApi: any): number {
  const { items } = docApi.contentControls.list();

  let unwrapped = 0;
  for (const item of items) {
    const result = docApi.contentControls.unwrap(
      { target: item.target },
      { skipTrackChanges: true }
    );
    if (result?.success) {
      unwrapped++;
    }
  }

  return unwrapped;
}
