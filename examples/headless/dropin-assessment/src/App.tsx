import { useState } from 'react';
import { TipTapView } from './editors/TipTapView';
import { SuperDocView } from './editors/SuperDocView';

type EditorKind = 'tiptap' | 'superdoc';

export function App() {
  const [kind, setKind] = useState<EditorKind>('tiptap');

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>SuperDoc drop-in assessment</h1>
          <span className="sub">Same React UI, swappable editor</span>
        </div>
        <div className="editor-toggle">
          <button className={kind === 'tiptap' ? 'active' : ''} onClick={() => setKind('tiptap')}>
            TipTap (v1)
          </button>
          <button className={kind === 'superdoc' ? 'active' : ''} onClick={() => setKind('superdoc')}>
            SuperDoc (v2)
          </button>
        </div>
      </header>
      {kind === 'tiptap' ? <TipTapView /> : <SuperDocView />}
    </div>
  );
}
