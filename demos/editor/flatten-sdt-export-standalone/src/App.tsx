import { useState, useCallback } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { SuperDocUIProvider, useSuperDocUI, useSetSuperDoc } from 'superdoc/ui/react';
import './styles.css';

const USER = { name: 'Demo User', email: 'demo@example.com' };
const MODULES = {
  comments: { defaultOpen: true },
  trackChanges: {},
};

export function App() {
  return (
    <SuperDocUIProvider>
      <AppInner />
    </SuperDocUIProvider>
  );
}

function AppInner() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Flatten SDT Export Demo</h1>
        <p className="subtitle">
          Export with SDTs flattened to plain text while preserving tracked changes.
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

  const handleReady = useCallback(
    ({ superdoc }: { superdoc: unknown }) => {
      setSuperDoc(superdoc);
    },
    [setSuperDoc]
  );

  return (
    <SuperDocEditor
      document="/sample-review.docx"
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
 * Export document.
 * With the patch applied, SDTs are automatically flattened while tracked changes are preserved.
 */
function FlattenAndExportButton() {
  const ui = useSuperDocUI();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!ui || busy) return;
    setBusy(true);

    try {
      console.log('[Export] Exporting (SDTs auto-flattened by patch)...');
      await ui.document.export({
        exportType: ['docx'],
        triggerDownload: true,
      });
      console.log('[Export] Download complete');
    } catch (err) {
      console.error('[Export] Failed:', err);
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn btn-primary" disabled={!ui || busy} onClick={onClick}>
      {busy ? 'Exporting...' : 'Export'}
    </button>
  );
}
