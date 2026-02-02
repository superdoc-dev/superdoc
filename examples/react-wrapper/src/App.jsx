import { useRef, useState } from 'react';
import { SuperDocEditor } from '@superdoc/react';
import '@superdoc/react/style.css';
import './App.css';

function App() {
  const [documentFile, setDocumentFile] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [mode, setMode] = useState('editing');
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setDocumentFile(file);
      setIsReady(false);
    }
  };

  const handleReady = ({ superdoc }) => {
    console.log('SuperDoc is ready!', superdoc);
    setIsReady(true);
  };

  const handleExport = async () => {
    try {
      await editorRef.current?.export({ triggerDownload: true });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    editorRef.current?.setDocumentMode(newMode);
  };

  const handleGetHTML = () => {
    const html = editorRef.current?.getHTML();
    console.log('HTML content:', html);
    alert(`Got ${html?.length || 0} document(s). Check console for content.`);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>@superdoc/react Example</h1>

        <div className="controls">
          <button onClick={() => fileInputRef.current?.click()}>
            Load Document
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".docx"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {isReady && (
            <>
              <div className="mode-selector">
                <label>Mode:</label>
                <select value={mode} onChange={(e) => handleModeChange(e.target.value)}>
                  <option value="editing">Editing</option>
                  <option value="suggesting">Suggesting</option>
                  <option value="viewing">Viewing</option>
                </select>
              </div>

              <button onClick={handleExport}>Export DOCX</button>
              <button onClick={handleGetHTML}>Get HTML</button>
              <button onClick={() => editorRef.current?.focus()}>Focus</button>
              <button onClick={() => editorRef.current?.toggleRuler()}>Toggle Ruler</button>
            </>
          )}
        </div>
      </header>

      <main className="main">
        <SuperDocEditor
          ref={editorRef}
          document={documentFile}
          documentMode={mode}
          rulers={true}
          renderLoading={() => (
            <div className="loading">
              <div className="spinner" />
              <p>Loading document...</p>
            </div>
          )}
          onReady={handleReady}
          onEditorCreate={({ editor }) => {
            console.log('Editor created:', editor);
          }}
          onEditorDestroy={() => {
            console.log('Editor destroyed');
          }}
          onContentError={({ error }) => {
            console.error('Content error:', error);
          }}
          onException={({ error }) => {
            console.error('Exception:', error);
          }}
          className="superdoc-editor"
          style={{ height: '100%' }}
        />
      </main>
    </div>
  );
}

export default App;
