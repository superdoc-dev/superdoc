import { useState, useRef, useEffect } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import CommentsPanel from './components/CommentsPanel';
import './App.css';

export default function App() {
  // State
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const superdocRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  // Actions
  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setHasDocument(true);
    }
  };

  const handleBlankDocument = () => {
    setPendingFile(null);
    setHasDocument(true);
  };

  // Initialize editor when container is ready
  useEffect(() => {
    if (hasDocument && containerRef.current && !superdocRef.current) {
      superdocRef.current = new SuperDoc({
        selector: containerRef.current,
        document: pendingFile ? { data: pendingFile, id: 'doc-1' } : undefined,
        documentMode: 'editing',
        modules: {
          toolbar: { selector: '#toolbar' },
          comments: { displayMode: 'inline' },
          trackChanges: { visible: true },
        },
        onEditorCreate: ({ editor }) => {
          window.editor = editor;
          window.superdoc = superdocRef.current;
          setIsReady(true);
        },
      });
    }
  }, [hasDocument, pendingFile]);

  return (
    <div className="app">
      <header className="header">
        <h1>SuperDoc</h1>
        <span className="subtitle">Headless Comments Panel Demo</span>
        <input
          type="file"
          accept=".docx"
          ref={fileInputRef}
          onChange={handleFileSelect}
          hidden
        />
      </header>

      <div id="toolbar" className="toolbar" />

      <main className="main">
        {hasDocument ? (
          <>
            <div className="editor-area">
              <div ref={containerRef} className="superdoc-container" />
            </div>
            <aside className="sidebar">
              <CommentsPanel isReady={isReady} />
            </aside>
          </>
        ) : (
          <div className="start-screen">
            <button className="start-btn" onClick={openFilePicker}>
              Upload document
            </button>
            <button className="start-btn secondary" onClick={handleBlankDocument}>
              Blank document
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
