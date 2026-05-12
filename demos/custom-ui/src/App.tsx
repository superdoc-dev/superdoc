import { useCallback, useState } from 'react';
import { SuperDocUIProvider } from 'superdoc/ui/react';
import { EditorMount } from './editor/EditorMount';
import { Toolbar } from './components/Toolbar';
import { ActivitySidebar } from './components/ActivitySidebar';
import { SelectionPopover } from './components/SelectionPopover';
import { ContextMenu } from './components/ContextMenu';
import { ContextMenuRegistrations } from './components/ContextMenuRegistrations';
import { useDecidedChanges } from './components/useDecidedChanges';

export function App() {
  return (
    <SuperDocUIProvider>
      <AppInner />
    </SuperDocUIProvider>
  );
}

/**
 * Hooks that subscribe to the controller (like `useDecidedChanges`)
 * have to live INSIDE `<SuperDocUIProvider>`, so the page-level hook
 * work happens here rather than in `App`. Keeping `App` as a thin
 * provider wrapper also matches what a real consumer's root usually
 * does.
 */
function AppInner() {
  // The composer is sidebar-side UI but is triggered from the toolbar's
  // comment button. Lifting the open/close state to the layout root is
  // the simplest path; a real product might dispatch through a state
  // store, but the example keeps the wiring obvious.
  const [composeOpen, setComposeOpen] = useState(false);
  // Shared decided-changes store. Both ActivitySidebar (per-card
  // accept/reject buttons) and the right-click context menu route
  // through `decided.decideChange` so the Resolved audit row shows
  // up regardless of which surface fired the decision.
  const decided = useDecidedChanges();
  // Stable callbacks so the effect-driven `ContextMenuRegistrations`
  // (and similar children whose deps include these handlers) don't
  // unregister and re-register every time `composeOpen` toggles or a
  // track-change tick re-runs `useDecidedChanges`. The demo is the
  // canonical example consumers copy; teaching "register inside an
  // effect with unstable deps" would re-emerge as registry churn in
  // every consumer that follows the pattern.
  const openComposer = useCallback(() => setComposeOpen(true), []);
  const closeComposer = useCallback(() => setComposeOpen(false), []);

  return (
    <div className="app">
      <header className="app-header">
          <h1>Contract Review Workspace</h1>
          <span className="subtitle">Memorandum · review pending</span>
        </header>

        <div className="app-body">
          <section className="editor-area">
            <div className="toolbar-shell">
              <Toolbar onComposeComment={openComposer} />
            </div>
            <div className="editor-shell">
              <div className="editor-canvas">
                <EditorMount />
              </div>
            </div>
            <SelectionPopover onComposeComment={openComposer} />
            <ContextMenu />
            <ContextMenuRegistrations decided={decided} onComposeComment={openComposer} />
          </section>

          <aside className="sidebar">
            <div className="sidebar-header">Activity</div>
            <div className="sidebar-panel">
              <ActivitySidebar
                composeOpen={composeOpen}
                onCloseComposer={closeComposer}
                decided={decided}
              />
            </div>
          </aside>
        </div>
    </div>
  );
}
