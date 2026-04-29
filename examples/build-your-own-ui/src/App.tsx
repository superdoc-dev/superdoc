import { useState } from 'react';
import { SuperDocUIProvider } from './lib/SuperDocUIProvider';
import { EditorMount } from './editor/EditorMount';
import { Toolbar } from './components/Toolbar';
import { CommentsSidebar } from './components/CommentsSidebar';
import { ReviewSidebar } from './components/ReviewSidebar';

type Tab = 'comments' | 'review';

export function App() {
  const [tab, setTab] = useState<Tab>('comments');

  return (
    <SuperDocUIProvider>
      <div className="app">
        <header className="app-header">
          <h1>SuperDoc — Build your own UI</h1>
          <span className="subtitle">Custom toolbar + sidebars wired to createSuperDocUI</span>
        </header>

        <div className="app-body">
          <section className="editor-area">
            <div className="toolbar-shell">
              <Toolbar />
            </div>
            <div className="editor-shell">
              <EditorMount />
            </div>
          </section>

          <aside className="sidebar">
            <div className="sidebar-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'comments'}
                className={`sidebar-tab ${tab === 'comments' ? 'active' : ''}`}
                onClick={() => setTab('comments')}
              >
                Comments
              </button>
              <button
                role="tab"
                aria-selected={tab === 'review'}
                className={`sidebar-tab ${tab === 'review' ? 'active' : ''}`}
                onClick={() => setTab('review')}
              >
                Review
              </button>
            </div>
            <div className="sidebar-panel">
              {tab === 'comments' ? <CommentsSidebar /> : <ReviewSidebar />}
            </div>
          </aside>
        </div>
      </div>
    </SuperDocUIProvider>
  );
}
