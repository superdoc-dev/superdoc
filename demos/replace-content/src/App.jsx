import { useRef, useReducer } from 'react';
import DocumentEditor from './components/DocumentEditor';

function App() {
  const [, _forceUpdate] = useReducer(x => x + 1, 0);
  
  const forceUpdate = async (uploadingFile = false) => {
    // Save editor content to documentFileRef before forcing update
    if (editorRef.current && editorRef.current.activeEditor && !uploadingFile) {
      try {
        const result = await editorRef.current.activeEditor.exportDocx();
        const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const blob = new Blob([result], { type: DOCX });
        const file = new File([blob], `document-${Date.now()}.docx`, { type: DOCX });
        documentFileRef.current = file;
        console.log('Saved editor content as DOCX file to documentFileRef:', file);
      } catch (error) {
        console.warn('Could not save editor content:', error);
      }
    }
    _forceUpdate();
  };
  
const exampleJSON = {
  type: 'text',
  marks: [
    {
      type: 'aiAnimationMark',
      attrs: {
        class: 'sd-ai-text-appear',
        dataMarkId: `ai-animation-${Date.now()}`,
      },
    },
  ],
  text: 'Hello, SuperDoc~!!',
};

  const exampleHTML = '<p>Hello, SuperDoc~!!</p>';

  const documentFileRef = useRef(null);
  const drawerOpenRef = useRef(true);
  const replacementScopeRef = useRef('document');
  const replacementContentTypeRef = useRef('html');
  const textareaRef = useRef(null);

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      documentFileRef.current = file;
      forceUpdate(true);
    }
  };

  const handleEditorReady = (editorInstance) => {
    console.log('SuperDoc editor is ready', editorInstance);
    editorRef.current = editorInstance;
  };

  const handleReplacementScopeChange = (event) => {
    replacementScopeRef.current = event.target.value;
    forceUpdate();
  };

  const handleReplacementContentTypeChange = (event) => {
    replacementContentTypeRef.current = event.target.value;
    // Update textarea content without triggering re-render
    if (textareaRef.current) {
      textareaRef.current.value = replacementContentTypeRef.current === 'json' ? JSON.stringify(exampleJSON, null, 2) : exampleHTML;
    }
    forceUpdate();
  };

  const toggleDrawer = () => {
    drawerOpenRef.current = !drawerOpenRef.current;
    forceUpdate();
  };

  const handleReplaceContent = () => {
    // Get textarea value directly from DOM
    const textareaContent = textareaRef.current ? textareaRef.current.value : '';
    
    if (!editorRef.current) {
      console.error('Editor not available');
      return;
    }

    if (replacementScopeRef.current === 'document') {
      // Select all content in the document
      editorRef.current.activeEditor.commands.selectAll();
    }

    const replacementContent = replacementContentTypeRef.current === "json" ? JSON.parse(textareaContent) : textareaContent;

    // Insert the raw content with animation mark
    editorRef.current.activeEditor.commands.insertContent(replacementContent);
  };

  return (
    <div className="app">
      <header>
        <h1>SuperDoc Example</h1>
        <button onClick={() => fileInputRef.current?.click()}>
          Load Document
        </button>
        <input
          type="file"
          ref={fileInputRef}
          accept=".docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </header>

      <main className="main-content">
        <DocumentEditor
          initialData={documentFileRef.current}
          onEditorReady={handleEditorReady}
        />
        
        <div className={`drawer-tab ${drawerOpenRef.current ? 'drawer-open' : ''}`} onClick={toggleDrawer}>
          <span>{drawerOpenRef.current ? '◀' : '▶'}</span>
        </div>
        
        <div className={`drawer ${drawerOpenRef.current ? 'open' : ''}`}>
          <div className="drawer-content">
            <h3>Content Replacement</h3>
            
            <div className="form-group">
              <label htmlFor="replacementScope">Replace</label>
              <select 
                id="replacementScope"
                value={replacementScopeRef.current}
                onChange={handleReplacementScopeChange}
              >
                <option value="document">Document</option>
                <option value="selection">Selection</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="replacementContentType">with</label>
              <select 
                id="replacementContentType"
                value={replacementContentTypeRef.current}
                onChange={handleReplacementContentTypeChange}
              >
                <option value="html">HTML</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="contentTextarea">content:</label>
              <textarea 
                ref={textareaRef}
                id="contentTextarea"
                defaultValue={exampleHTML}
                placeholder={`Enter ${replacementContentTypeRef.current.toUpperCase() || "HTML"} code here...`}
                rows={6}
              />
            </div>

            <div className="form-group">
              <button className="apply-btn" onClick={handleReplaceContent}>Replace content</button>
            </div>
          </div>
        </div>
      </main>

      <style jsx>{`
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
        .main-content {
          flex: 1;
          min-height: 0;
          position: relative;
        }
        .drawer-tab {
          position: fixed;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          background: #1355ff;
          color: white;
          width: 30px;
          height: 60px;
          border-radius: 8px 0 0 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 1001;
          transition: all 0.3s ease;
          box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
        }
        .drawer-tab:hover {
          background: #0044ff;
          width: 35px;
        }
        .drawer-tab.drawer-open {
          right: 300px;
        }
        .drawer-tab span {
          font-size: 14px;
          font-weight: bold;
        }
        .drawer {
          position: fixed;
          right: -300px;
          top: 0;
          bottom: 0;
          width: 300px;
          background: white;
          border-left: 1px solid #ddd;
          box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          transition: right 0.3s ease;
        }
        .drawer.open {
          right: 0;
        }
        .drawer-content {
          padding: 1rem;
          height: 100%;
          overflow-y: auto;
        }
        .drawer-content h3 {
          margin: 0 0 1rem 0;
          color: #333;
          font-size: 1.1em;
          font-weight: 600;
        }
        .form-group {
          margin-bottom: 1rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #555;
          font-size: 0.9em;
        }
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.9em;
          background: white;
        }
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #1355ff;
          box-shadow: 0 0 0 2px rgba(19, 85, 255, 0.1);
        }
        .form-group textarea {
          resize: vertical;
          min-height: 120px;
          font-family: inherit;
        }
        .apply-btn {
          width: 100%;
          padding: 0.75rem;
          background: #1355ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
        }
        .apply-btn:hover {
          background: #0044ff;
        }
      `}</style>
    </div>
  );
}

export default App;