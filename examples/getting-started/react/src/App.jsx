import { useRef, useState } from 'react';
import { SuperDocEditor } from '@superdoc/react';
import '@superdoc/react/style.css';

function App() {
  const [documentFile, setDocumentFile] = useState(null);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setDocumentFile(file);
    }
  };

  const handleExport = async () => {
    await editorRef.current?.getInstance()?.export({ triggerDownload: true });
  };

  return (
    <div className="app">
      <header>
        <h1>SuperDoc React Example</h1>
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
        {documentFile && (
          <button onClick={handleExport}>
            Export DOCX
          </button>
        )}
      </header>

      <main>
        {documentFile ? (
          <SuperDocEditor
            ref={editorRef}
            document={documentFile}
            documentMode="editing"
            rulers
            onReady={({ superdoc }) => console.log('SuperDoc ready', superdoc)}
            onEditorCreate={({ editor }) => console.log('Editor created', editor)}
            renderLoading={() => (
              <div className="loading">Loading document...</div>
            )}
            style={{ height: '100%' }}
          />
        ) : (
          <div className="empty-state">
            <p>Click "Load Document" to open a .docx file</p>
          </div>
        )}
      </main>

      <style>{`
        .app {
          height: 100vh;
          display: flex;
          flex-direction: column;
        }
        header {
          padding: 1rem;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        header button {
          padding: 0.5rem 1rem;
          background: #1355ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        header button:hover {
          background: #0044ff;
        }
        main {
          flex: 1;
          min-height: 0;
        }
        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
        }
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
        }
      `}</style>
    </div>
  );
}

export default App;
