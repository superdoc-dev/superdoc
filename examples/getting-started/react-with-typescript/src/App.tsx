import { useRef, useState } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import type { SuperDocRef, DocumentMode } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import './App.css';

/**
 * SuperDoc React + TypeScript Example
 *
 * Demonstrates:
 * - File upload with type safety
 * - Document mode switching (editing/viewing/suggesting)
 * - Export functionality via ref API
 * - User information
 * - Loading states
 * - Event callbacks
 */
function App() {
  // Document state
  const [document, setDocument] = useState<File | null>(null);
  const [mode, setMode] = useState<DocumentMode>('editing');
  const [isReady, setIsReady] = useState(false);

  // Ref for accessing SuperDoc instance methods
  const editorRef = useRef<SuperDocRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current user (typed)
  const currentUser = {
    name: 'John Doe',
    email: 'john@example.com',
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.docx')) {
      setDocument(file);
      setIsReady(false);
    }
  };

  // Export document as DOCX
  const handleExport = async () => {
    const instance = editorRef.current?.getInstance();
    if (instance) {
      await instance.export({ triggerDownload: true });
    }
  };

  // Get document as HTML
  const handleGetHTML = () => {
    const instance = editorRef.current?.getInstance();
    if (instance) {
      const html = instance.getHTML();
      console.log('Document HTML:', html);
      alert(`Document has ${html.length} section(s). Check console for HTML.`);
    }
  };

  // Mode button component for cleaner JSX
  const ModeButton = ({
    targetMode,
    label,
  }: {
    targetMode: DocumentMode;
    label: string;
  }) => (
    <button
      className={`mode-btn ${mode === targetMode ? 'active' : ''}`}
      onClick={() => setMode(targetMode)}
      disabled={!document}
    >
      {label}
    </button>
  );

  return (
    <div className="app">
      {/* Header with controls */}
      <header className="header">
        <h1>SuperDoc React + TypeScript</h1>

        <div className="controls">
          {/* File upload */}
          <button
            className="btn primary"
            onClick={() => fileInputRef.current?.click()}
          >
            {document ? 'Change Document' : 'Open Document'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileSelect}
            hidden
          />

          {/* Mode switcher */}
          {document && (
            <div className="mode-switcher">
              <ModeButton targetMode="editing" label="Edit" />
              <ModeButton targetMode="suggesting" label="Suggest" />
              <ModeButton targetMode="viewing" label="View" />
            </div>
          )}

          {/* Actions */}
          {document && isReady && (
            <div className="actions">
              <button className="btn" onClick={handleExport}>
                Export DOCX
              </button>
              <button className="btn" onClick={handleGetHTML}>
                Get HTML
              </button>
            </div>
          )}
        </div>

        {/* Status indicator */}
        {document && (
          <div className="status">
            <span className={`status-dot ${isReady ? 'ready' : 'loading'}`} />
            <span>{isReady ? `Ready - ${mode} mode` : 'Loading...'}</span>
          </div>
        )}
      </header>

      {/* Editor area */}
      <main className="editor-area">
        {document ? (
          <SuperDocEditor
            ref={editorRef}
            document={document}
            documentMode={mode}
            role="editor"
            user={currentUser}
            rulers
            onReady={({ superdoc }) => {
              console.log('SuperDoc ready:', superdoc);
              setIsReady(true);
            }}
            onEditorCreate={({ editor }) => {
              console.log('ProseMirror editor created:', editor);
            }}
            onEditorUpdate={() => {
              console.log('Document updated');
            }}
            onContentError={(event) => {
              console.error('Content error:', event);
            }}
            renderLoading={() => (
              <div className="loading-state">
                <div className="spinner" />
                <p>Loading document...</p>
              </div>
            )}
            style={{ height: '100%' }}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-content">
              <h2>No Document Loaded</h2>
              <p>Click "Open Document" to load a .docx file</p>
              <button
                className="btn primary large"
                onClick={() => fileInputRef.current?.click()}
              >
                Open Document
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
