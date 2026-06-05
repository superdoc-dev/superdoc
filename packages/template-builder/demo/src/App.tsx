import { useRef } from 'react';
import { SuperDocEditor } from '@superdoc-dev/react';
import type { SuperDocRef } from '@superdoc-dev/react';
import 'superdoc/style.css';
import './App.css';

// Sample document for testing
const SAMPLE_DOCUMENT = '/template.docx';

function App() {
  const editorRef = useRef<SuperDocRef>(null);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>SuperDoc React Demo</h1>
        <p>Tracked Changes</p>
      </header>

      <div className="editor-container">
        <SuperDocEditor
          ref={editorRef}
          document={SAMPLE_DOCUMENT}
          documentMode="suggesting"
          user={{ name: 'Demo User', email: 'demo@example.com' }}
          modules={{
            comments: { visible: true },
            trackChanges: { visible: true, enabled: true },
          }}
          style={{ height: '100%' }}
          onReady={(event) => {
            console.log('SuperDoc ready:', event.superdoc);
          }}
        />
      </div>
    </div>
  );
}

export default App;
