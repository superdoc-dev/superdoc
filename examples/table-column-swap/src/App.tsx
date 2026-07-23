import { useEffect, useRef, useState } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import type { Editor, SuperDocRef } from '@superdoc-dev/react';
import { superdocFonts } from '@superdoc-dev/fonts';
import { TableColumnReorder } from './TableColumnReorder';
import '@superdoc-dev/react/style.css';
import './App.css';

const DEFAULT_DOCUMENT_URL = '/default-table.docx';

async function loadDefaultDocument(): Promise<File> {
  const response = await fetch(DEFAULT_DOCUMENT_URL);
  if (!response.ok) throw new Error(`Unable to load the default document (${response.status})`);
  return new File([await response.blob()], 'default-table.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function App() {
  const editorRef = useRef<SuperDocRef>(null);
  const reorderRef = useRef<TableColumnReorder | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [tableId, setTableId] = useState('');
  const [sourceColumn, setSourceColumn] = useState(0);
  const [destinationColumn, setDestinationColumn] = useState(1);
  const [placement, setPlacement] = useState<'before' | 'after'>('after');
  const [status, setStatus] = useState('Loading the default document…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadDefaultDocument()
      .then(setDocument)
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  const handleEditorCreate = ({ editor }: { editor: Editor }) => {
    const reorder = new TableColumnReorder(editor);
    reorderRef.current = reorder;
    const firstTableId = reorder.findFirstTableId();
    setTableId(firstTableId);
    setStatus(`Ready. Using table ${firstTableId}.`);
  };

  const handleMove = () => {
    if (!reorderRef.current || !tableId) return;
    setBusy(true);
    try {
      const result = reorderRef.current.moveColumn({ tableId, sourceColumn, destinationColumn, placement });
      setTableId(result.tableId);
      setStatus(`Moved column ${sourceColumn} ${placement} column ${destinationColumn}. Cell content is plain text.`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    await editorRef.current?.getInstance()?.export({ triggerDownload: true });
  };

  return (
    <div className="app">
      <header className="header">
        <div className="title-group">
          <h1>SuperDoc table column reorder</h1>
          <p>Best-effort insert → plain-text copy → delete workflow</p>
        </div>
        <div className="controls">
          <label>
            Source column
            <input type="number" min="0" value={sourceColumn} onChange={(e) => setSourceColumn(Number(e.target.value))} />
          </label>
          <label>
            Destination column
            <input type="number" min="0" value={destinationColumn} onChange={(e) => setDestinationColumn(Number(e.target.value))} />
          </label>
          <label>
            Placement
            <select value={placement} onChange={(e) => setPlacement(e.target.value as 'before' | 'after')}>
              <option value="before">Before destination</option>
              <option value="after">After destination</option>
            </select>
          </label>
          <button className="btn primary" disabled={!tableId || busy} onClick={handleMove}>
            {busy ? 'Moving…' : 'Move column'}
          </button>
          <button className="btn" disabled={!document} onClick={handleExport}>Export DOCX</button>
        </div>
        <div className="status">{status}</div>
      </header>
      <main className="editor-area">
        {document ? (
          <SuperDocEditor
            ref={editorRef}
            document={document}
            fonts={superdocFonts}
            documentMode="editing"
            role="editor"
            user={{ name: 'Table Demo', email: 'table-demo@example.com' }}
            rulers
            onEditorCreate={handleEditorCreate}
            onContentError={(event) => setStatus(`Content error: ${String(event)}`)}
            style={{ height: '100%' }}
          />
        ) : (
          <div className="loading-state">Loading default-table.docx…</div>
        )}
      </main>
    </div>
  );
}

export default App;
