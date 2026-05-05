import { useState } from 'react';
import { SuperDocUIProvider } from 'superdoc/ui/react';
import { EditorMount } from './editor/EditorMount';
import { Toolbar } from './components/Toolbar';
import { ActivitySidebar } from './components/ActivitySidebar';
import { SelectionPopover } from './components/SelectionPopover';
import { ContextMenu } from './components/ContextMenu';
import { ContextMenuRegistrations } from './components/ContextMenuRegistrations';

export function App() {
  // The composer is sidebar-side UI but is triggered from the toolbar's
  // comment button. Lifting the open/close state to the layout root is
  // the simplest path; a real product might dispatch through a state
  // store, but the example keeps the wiring obvious.
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <SuperDocUIProvider>
      <div className="app">
        <header className="app-header">
          <h1>Contract Review Workspace</h1>
          <span className="subtitle">Memorandum · review pending</span>
        </header>

        <div className="app-body">
          <section className="editor-area">
            <div className="toolbar-shell">
              <Toolbar onComposeComment={() => setComposeOpen(true)} />
            </div>
            <div className="editor-shell">
              <EditorMount />
            </div>
            <SelectionPopover onComposeComment={() => setComposeOpen(true)} />
            <ContextMenu />
            <ContextMenuRegistrations />
          </section>

          <aside className="sidebar">
            <div className="sidebar-header">Activity</div>
            <div className="sidebar-panel">
              <ActivitySidebar
                composeOpen={composeOpen}
                onCloseComposer={() => setComposeOpen(false)}
              />
            </div>
          </aside>
        </div>
      </div>
    </SuperDocUIProvider>
  );
}
