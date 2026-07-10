import { useCallback, useState, useEffect, useRef } from 'react';
import { SuperDocUIProvider } from 'superdoc/ui/react';
import { EditorMount } from './editor/EditorMount';
import { Toolbar } from './components/Toolbar';
import { ContextMenu } from './components/ContextMenu';
import { ContextMenuRegistrations } from './components/ContextMenuRegistrations';
import { AIPromptPopover, type AIPromptOpenState } from './components/AIPromptPopover';
import { E2EProbe } from './e2e/E2EProbe';

export function App() {
  return (
    <SuperDocUIProvider>
      <AppInner />
      <E2EProbe />
    </SuperDocUIProvider>
  );
}

function AppInner() {
  // AI prompt popover state. Tracks position and captured selection.
  const [aiPromptState, setAIPromptState] = useState<AIPromptOpenState | null>(null);
  // Track last contextmenu position so AI popover can appear there
  const lastContextMenuPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track contextmenu events to capture click position
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      lastContextMenuPos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('contextmenu', handler, true);
    return () => document.removeEventListener('contextmenu', handler, true);
  }, []);

  const openAIPrompt = useCallback((state: AIPromptOpenState) => {
    // Use the last contextmenu position for accurate placement
    setAIPromptState({
      ...state,
      x: lastContextMenuPos.current.x,
      y: lastContextMenuPos.current.y,
    });
  }, []);
  const closeAIPrompt = useCallback(() => setAIPromptState(null), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SuperDoc AI Highlight</h1>
      </header>

      <div className="app-body">
        <section className="editor-area editor-area-full">
          <div className="toolbar-shell">
            <Toolbar />
          </div>
          <div className="editor-shell">
            <div className="editor-canvas">
              <EditorMount />
            </div>
          </div>
          <ContextMenu />
          <ContextMenuRegistrations onOpenAIPrompt={openAIPrompt} />
          <AIPromptPopover openState={aiPromptState} onClose={closeAIPrompt} />
        </section>
      </div>
    </div>
  );
}
